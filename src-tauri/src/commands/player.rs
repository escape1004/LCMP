use std::fs::File;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::sync::mpsc;
use std::collections::VecDeque;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::codecs::CODEC_TYPE_NULL;
use symphonia::default::get_probe;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::audio::Signal;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};
use crate::database::get_connection;

// 플레이어 상태
struct PlayerState {
    is_playing: bool,
    is_paused: bool,
    current_file: Option<String>,
    volume: f32,
    seek_time: Option<f64>,
    should_stop: bool,
    samples_played: u64, // 실제로 오디오 스트림에서 출력된 샘플 수 (스테레오 샘플 수)
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            is_playing: false,
            is_paused: false,
            current_file: None,
            volume: 0.5,
            seek_time: None,
            should_stop: false,
            samples_played: 0,
        }
    }
}

// 전역 플레이어 상태
static PLAYER_STATE: Mutex<Option<Arc<Mutex<PlayerState>>>> = Mutex::new(None);
// Stream은 Send가 아니므로 전역에 저장하지 않음

#[tauri::command]
pub async fn get_audio_duration(file_path: String) -> Result<f64, String> {
    let file = File::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = std::path::Path::new(&file_path).extension() {
        if let Some(ext_str) = extension.to_str() {
            hint.with_extension(ext_str);
        }
    }
    
    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    
    let probe = get_probe();
    let probed = probe.format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Failed to probe format: {}", e))?;
    
    let format = probed.format;
    let track = format.tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No valid audio track found".to_string())?;
    
    let time_base = track.codec_params.time_base
        .ok_or_else(|| "No time base found".to_string())?;
    
    let duration = if let Some(frames) = track.codec_params.n_frames {
        let time = time_base.calc_time(frames);
        time.seconds as f64 + time.frac as f64
    } else {
        return Err("Could not calculate duration: no frame count".to_string());
    };
    
    Ok(duration)
}

#[tauri::command]
pub async fn extract_waveform(file_path: String, samples: usize) -> Result<Vec<f32>, String> {
    // 오디오 파일 열기
    let file = File::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = std::path::Path::new(&file_path).extension() {
        if let Some(ext_str) = extension.to_str() {
            hint.with_extension(ext_str);
        }
    }
    
    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    
    let probe = get_probe();
    let mut probed = probe.format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Failed to probe format: {}", e))?;
    
    // 오디오 트랙 찾기
    let track = probed.format.tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No valid audio track found".to_string())?;
    
    // 전체 길이 계산 (파일을 다시 열지 않고 현재 probed format에서 가져오기)
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100) as usize;
    let duration_sec = if let Some(time_base) = track.codec_params.time_base {
        if let Some(frames) = track.codec_params.n_frames {
            let time = time_base.calc_time(frames);
            time.seconds as f64 + time.frac as f64
        } else {
            // n_frames가 없으면 스트리밍으로 처리하면서 동적 계산
            0.0
        }
    } else {
        0.0
    };
    
    // 청크 크기 계산
    let chunk_size = if duration_sec > 0.0 {
        let estimated_total_samples = (duration_sec * sample_rate as f64) as usize;
        (estimated_total_samples as f64 / samples as f64).ceil() as usize
    } else {
        // duration을 모를 경우 기본값 사용 (동적 조정)
        1024
    };
    
    // 디코더 생성
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    
    // 스트리밍 방식으로 웨이폼 추출 (메모리 효율적)
    // 각 웨이폼 청크에 대한 RMS 값을 누적 계산
    let mut waveform_chunks: Vec<(f32, usize)> = vec![(0.0, 0); samples]; // (sum_squares, count)
    let mut sample_counter = 0usize;
    let mut dynamic_chunk_size = chunk_size;
    
    loop {
        let packet = match probed.format.next_packet() {
            Ok(packet) => packet,
            Err(symphonia::core::errors::Error::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(_) => {
                break; // 파일 끝
            }
        };
        
        if let Ok(decoded) = decoder.decode(&packet) {
            let audio_buf = decoded;
            let frames = audio_buf.frames();
            let channels_count = audio_buf.spec().channels.count() as usize;
            
            // f32 버퍼로 변환
            // 🔥 핵심: frames가 아니라 capacity로 dest를 만든다
            // convert()는 frames가 아니라 capacity 기준으로 dest 용량이 충분한지 체크함
            let spec = *audio_buf.spec();
            let cap = audio_buf.capacity();
            let duration = symphonia::core::units::Duration::from(cap as u64);
            let mut f32_buf = symphonia::core::audio::AudioBuffer::<f32>::new(
                duration,
                spec
            );
            audio_buf.convert(&mut f32_buf);
            // ✅ 이후 처리는 frames까지만 사용 (버퍼는 넉넉히 만들고, 실제 사용은 frames까지만)
            
            // duration을 모를 경우 동적으로 청크 크기 조정
            if duration_sec == 0.0 && sample_counter > 0 && sample_counter % 10000 == 0 {
                // 샘플 수를 기반으로 청크 크기 재계산
                dynamic_chunk_size = (sample_counter / samples).max(1);
            }
            
            // 모든 채널의 평균을 계산하여 모노로 변환하면서 RMS 누적
            for frame_idx in 0..frames {
                // 모노 변환
                let mut sum = 0.0;
                for ch in 0..channels_count {
                    sum += f32_buf.chan(ch)[frame_idx];
                }
                let mono_sample = sum / channels_count as f32;
                
                // 현재 샘플이 속할 웨이폼 청크 인덱스 계산
                let chunk_idx = (sample_counter / dynamic_chunk_size).min(samples - 1);
                
                // RMS 누적 (sum_squares)
                waveform_chunks[chunk_idx].0 += mono_sample * mono_sample;
                waveform_chunks[chunk_idx].1 += 1;
                
                sample_counter += 1;
            }
        }
    }
    
    if sample_counter == 0 {
        return Err("No audio data found".to_string());
    }
    
    // 누적된 데이터를 기반으로 RMS 계산
    let mut waveform = Vec::with_capacity(samples);
    for i in 0..samples {
        let (sum_squares, count) = waveform_chunks[i];
        if count > 0 {
            let rms = (sum_squares / count as f32).sqrt();
            waveform.push(rms);
        } else {
            waveform.push(0.0);
        }
    }
    
    // 정규화 (0.0 ~ 1.0)
    let max = waveform.iter().copied().fold(0.0f32, f32::max);
    if max > 0.0 {
        for value in waveform.iter_mut() {
            *value /= max;
        }
    }
    
    Ok(waveform)
}

#[tauri::command]
pub async fn play_audio(file_path: String, volume: f32, seek_time: Option<f64>) -> Result<(), String> {
    // 기존 재생 중지
    stop_audio().await.ok();
    
    // 기존 스레드가 완전히 종료될 때까지 잠시 대기
    thread::sleep(Duration::from_millis(100));
    
    let state = Arc::new(Mutex::new(PlayerState {
        is_playing: true,
        is_paused: false,
        current_file: Some(file_path.clone()),
        volume: volume.max(0.0).min(1.0),
        seek_time,
        should_stop: false,
        samples_played: 0,
    }));
    
    *PLAYER_STATE.lock().unwrap() = Some(state.clone());
    
    thread::spawn(move || {
        if let Err(e) = play_audio_thread(file_path, state) {
            eprintln!("Audio playback error: {}", e);
        }
    });
    
    Ok(())
}

fn play_audio_thread(file_path: String, state: Arc<Mutex<PlayerState>>) -> Result<(), String> {
    let file = File::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    // MediaSourceStream 버퍼 크기 증가 (프리로딩을 위해 충분히 큰 버퍼)
    // VBR 파일과 큰 ID3 태그를 처리하기 위해 버퍼 크기 증가
    let mut mss_opts = MediaSourceStreamOptions::default();
    mss_opts.buffer_len = 8 * 1024 * 1024; // 8MB 버퍼 (VBR, 큰 ID3 태그 처리용)
    
    let mss = MediaSourceStream::new(Box::new(file), mss_opts);
    let mut hint = Hint::new();
    if let Some(extension) = std::path::Path::new(&file_path).extension() {
        if let Some(ext_str) = extension.to_str() {
            hint.with_extension(ext_str);
        }
    }
    
    // 메타데이터 옵션: 큰 ID3 태그 처리
    let meta_opts: MetadataOptions = Default::default();
    
    // 포맷 옵션: VBR 파일과 ID3 태그 처리 강화
    let mut fmt_opts = FormatOptions::default();
    // gapless 재생 활성화 (ID3 태그와 오디오 스트림 구분 강화)
    fmt_opts.enable_gapless = true;
    // ⭐⭐⭐ 매우 중요: seek_index 비활성화 (특정 파일의 초반 EOF 문제 해결)
    // VBR 파일에서 부정확한 seek index로 인한 조기 EOF 방지
    fmt_opts.prebuild_seek_index = false;
    
    let probe = get_probe();
    let mut probed = probe.format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Failed to probe format: {}", e))?;
    
    // track 정보를 먼저 추출 (borrow 충돌 방지)
    // ✅ 오디오 트랙 선택 개선: sample_rate/channels 있는 트랙 + 가장 긴 트랙 우선
    // 첫 번째 유효한 코덱만 찾으면 비오디오 트랙(비디오/앨범아트 등)을 선택할 수 있음
    let track = probed.format.tracks()
        .iter()
        .filter(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .filter(|t| t.codec_params.sample_rate.is_some()) // 샘플 레이트가 있는 트랙만
        .filter(|t| t.codec_params.channels.is_some()) // 채널 정보가 있는 트랙만
        .max_by_key(|t| t.codec_params.n_frames.unwrap_or(0)) // 가장 긴 트랙 우선
        .ok_or_else(|| "No valid audio track found".to_string())?;
    
    // track에서 필요한 정보를 먼저 추출
    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let source_sample_rate = codec_params.sample_rate.unwrap_or(44100);
    
    // 예상 duration 계산 (파일 끝 감지용) - VBR 파일의 경우 부정확할 수 있으므로 참고용으로만 사용
    // 실제로는 프레임 단위로 읽으면서 동적으로 확인하는 것이 더 정확함
    let expected_duration = if let Some(time_base) = codec_params.time_base {
        if let Some(frames) = codec_params.n_frames {
            let time = time_base.calc_time(frames);
            Some(time.seconds as f64 + time.frac as f64)
        } else {
            None
        }
    } else {
        None
    };
    
    // VBR 파일의 경우 헤더 정보가 부정확할 수 있으므로, expected_duration을 None으로 처리하거나
    // 더 보수적인 임계값 사용 (예: 99% 대신 95%)
    
    // 디코더 옵션: 손상된 프레임 무시하고 계속 진행 (에러 복구 강화)
    let mut decoder_opts = DecoderOptions::default();
    decoder_opts.verify = false; // 프레임 검증 비활성화 (손상된 프레임도 처리)
    
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &decoder_opts)
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    
    let host = cpal::default_host();
    let device = host.default_output_device()
        .ok_or_else(|| "No output device available".to_string())?;
    
    let default_config = device.default_output_config()
        .map_err(|e| format!("Failed to get default output config: {}", e))?;
    
    let target_sample_rate = default_config.sample_rate().0 as u32;
    
    // ✅ CPAL 채널 수는 절대 변경하지 않음 (출력 장치 채널 수 = 진리)
    let config = default_config.config();
    // config.channels 그대로 둠 (출력 장치 채널 수 유지)
    
    // 디버깅: 채널 수 확인
    eprintln!("Output channels: {}, Sample rate: {}", config.channels, config.sample_rate.0);
    
    // ✅ Seek 처리: Seek = 재생 재시작 (참고 코드 패턴)
    // ❌ Seek 후 첫 패킷을 미리 읽지 않음 (디코딩 루프에서 자연스럽게 처리)
    // Seek 후 패킷을 미리 읽으면 format 상태가 불일치하여 EOF 루프에 빠질 수 있음
    let seek_time = state.lock().unwrap().seek_time.unwrap_or(0.0);
    let seek_seconds = seek_time as u64;
    let seek_frac = seek_time - seek_seconds as f64;
    
    // Seek 수행
    let seek_result = probed.format.seek(
        symphonia::core::formats::SeekMode::Accurate,
        symphonia::core::formats::SeekTo::Time {
            track_id: Some(track_id),
            time: symphonia::core::units::Time::new(seek_seconds, seek_frac),
        }
    );
    
    // Seek 성공 시 디코더 리셋 및 samples_played 초기화
    let initial_packet_time = seek_time;
    if seek_result.is_ok() {
        // Seek 성공 시 디코더 리셋 및 카운터 초기화
        decoder.reset();
        // Seek 시 samples_played를 반드시 초기화
        let expected_samples = (seek_time * target_sample_rate as f64 * 2.0) as u64;
        let mut state_guard = state.lock().unwrap();
        state_guard.samples_played = expected_samples;
        drop(state_guard);
        eprintln!("Seek to {:.2}s successful (initialization, samples_played: {})", 
            seek_time, expected_samples);
    } else {
        eprintln!("Seek to {:.2}s failed, attempting to seek to 0.0", seek_time);
        // Seek 실패 시 0초로 시도
        let seek_result_0 = probed.format.seek(
            symphonia::core::formats::SeekMode::Coarse,
            symphonia::core::formats::SeekTo::Time {
                track_id: Some(track_id),
                time: symphonia::core::units::Time::new(0, 0.0),
            }
        );
        if seek_result_0.is_ok() {
            decoder.reset();
            let mut state_guard = state.lock().unwrap();
            state_guard.samples_played = 0;
            drop(state_guard);
            eprintln!("Seek to 0.0s successful (initialization, samples_played: 0)");
        } else {
            eprintln!("Seek to 0.0 also failed, continuing from current position");
        }
    }
    
    // 채널을 통한 오디오 데이터 전달 (bounded channel로 버퍼 크기 제한)
    // 버퍼 크기를 충분히 크게 설정 (약 10초 분량 - AIMP처럼 안정적인 재생을 위해)
    // 각 Vec<f32>가 수백~수천 샘플을 담으므로, 충분히 큰 버퍼 필요
    let buffer_size = (target_sample_rate * 10) as usize; // 약 10초 분량 (Vec 개수)
    let (tx, rx) = mpsc::sync_channel::<Vec<f32>>(buffer_size);
    
    // 디코딩 스레드 (format과 decoder를 클로저로 이동)
    let state_clone = state.clone();
    let mut format_reader = probed.format;
    let needs_resampling = source_sample_rate != target_sample_rate;
    let resample_ratio = if needs_resampling {
        target_sample_rate as f64 / source_sample_rate as f64
    } else {
        1.0
    };
    
    // 클로저로 이동할 변수들
    let _expected_duration_clone = expected_duration; // 현재 사용하지 않지만 향후 사용 가능
    let _target_sample_rate_clone = target_sample_rate;
    let audio_track_id = track_id; // ✅ 오디오 트랙 ID (다른 트랙 패킷 스킵용)
    let codec_params_clone = codec_params.clone();
    let initial_packet_time_clone = initial_packet_time; // 초기화 Seek에서 읽은 첫 패킷의 타임스탬프
    let needs_resampling_clone = needs_resampling; // EOF에서 리샘플러 flush를 위해 필요
    
    // 여러 패킷을 배치로 처리하여 효율성 향상
    thread::spawn(move || {
        let mut batch_samples = Vec::new();
        // ✅ BATCH_SIZE를 1로 고정 (EOF 발생 시 연속 EOF 폭증 방지)
        // Seek 후 format_reader 재사용 시 EOF 상태 진입 시 batch로 읽으면 연속 EOF 폭증
        const BATCH_SIZE: usize = 1;
        
        // 고품질 리샘플러 초기화 (FLAC 무손실 재생용) - 첫 패킷 후에 초기화
        let mut resampler: Option<SincFixedIn<f32>> = None;
        // ✅ 재생 시간은 샘플 누적 기반으로만 계산 (packet.ts() 신뢰하지 않음)
        // packet.ts()는 VBR/encoder delay/gapless padding 때문에 점프할 수 있음
        // current_packet_time은 참고용으로만 사용 (UI 표시용)
        let mut current_packet_time = initial_packet_time_clone; // 참고용 (UI 표시용)
        // ✅ samples_played는 출력 콜백에서만 증가 (정확한 재생 시간 추적)
        let mut zero_frame_count = 0u32; // frames == 0 연속 카운트 (안전장치)
        
        // 디버깅 카운터: "진짜로 오디오 샘플이 0개도 안 나오는지" 확인용
        let mut decoded_ok = 0u64;
        let mut decoded_err = 0u64;
        let mut sent_samples = 0u64;
        let mut last_log = std::time::Instant::now(); // 주기 로그용
        
        loop {
            let should_stop = {
                let state_guard = state_clone.lock().unwrap();
                state_guard.should_stop
            };
            
            if should_stop {
                break;
            }
            
            // 배치로 여러 패킷 처리
            batch_samples.clear();
            
            for _ in 0..BATCH_SIZE {
                let packet = match format_reader.next_packet() {
                    Ok(packet) => {
                        // 🔥 핵심: 오디오 트랙이 아니면 스킵 (앨범아트/비디오/자막 등)
                        // Symphonia는 컨테이너에 트랙이 여러 개 있으면 모든 트랙의 패킷을 섞어서 줌
                        if packet.track_id() != audio_track_id {
                            continue; // 오디오 트랙이 아닌 패킷은 건너뛰기
                        }
                        
                        // 패킷 타임스탬프를 사용하여 재생 시간 업데이트 (리샘플링과 무관하게 정확함)
                        let packet_ts = packet.ts();
                        let mut packet_time = current_packet_time; // 기본값은 이전 값 유지
                        if let Some(time_base) = codec_params_clone.time_base {
                            let time = time_base.calc_time(packet_ts);
                            packet_time = time.seconds as f64 + time.frac as f64;
                        }
                        
                        // ✅ 패킷 타임스탬프는 참고용으로만 사용 (UI 표시용)
                        // Seek 후 첫 패킷 검증 로직 제거 (format 상태 불일치 방지)
                        current_packet_time = packet_time;
                        packet
                    },
                    Err(symphonia::core::errors::Error::ResetRequired) => {
                        // ResetRequired는 디코더 상태 문제이므로 reset 후 재시도
                        decoder.reset();
                        break;
                    }
                    Err(symphonia::core::errors::Error::IoError(ref io_err)) => {
                        // ✅ EOF 로직 단순화: UnexpectedEof는 디코더가 파일 끝에 도달했다는 의미
                        // ⛔ EOF에서 시간 계산하지 않음 (출력 기준 시간과 다를 수 있음)
                        // ⛔ EOF에서 is_playing = false 설정하지 않음 (출력 스레드가 남은 샘플 소비 후 종료)
                        if io_err.kind() == std::io::ErrorKind::UnexpectedEof {
                            eprintln!("Decoder reached EOF (file fully consumed)");
                            
                            // 🔥🔥🔥 핵심: 리샘플러 flush (내부에 남아있는 샘플 배출)
                            if needs_resampling_clone {
                                if let Some(ref mut resampler) = resampler {
                                    // Rubato는 빈 입력 + flush 신호로 내부 버퍼를 배출
                                    // flush 플래그는 채널별로 전달 (2채널이므로 [true, true])
                                    let flush_flags = [true, true];
                                    let empty_input: Vec<Vec<f32>> = vec![vec![], vec![]]; // 빈 입력 (2채널)
                                    if let Ok(output_channels) = resampler.process(&empty_input, Some(&flush_flags)) {
                                        if !output_channels.is_empty() && !output_channels[0].is_empty() {
                                            let frames = output_channels[0].len();
                                            let mut flushed = Vec::with_capacity(frames * 2);
                                            for i in 0..frames {
                                                flushed.push(output_channels[0][i]);
                                                flushed.push(
                                                    if output_channels.len() > 1 {
                                                        output_channels[1][i]
                                                    } else {
                                                        output_channels[0][i]
                                                    }
                                                );
                                            }
                                            batch_samples.extend(flushed);
                                        }
                                    }
                                }
                            }
                            
                            // 남은 샘플이 있으면 전송
                            if !batch_samples.is_empty() {
                                let _ = tx.send(batch_samples);
                            }
                            drop(tx); // 출력 스레드가 남은 샘플 다 소비하게 둠
                            return; // 디코딩 스레드 종료 (출력은 계속 진행)
                        } else {
                            // 🔥 중간 IO 에러는 그냥 스킵 (참고 코드 패턴)
                            continue; // 일시적인 에러는 스킵하고 다음 패킷 시도
                        }
                    }
                    Err(_) => {
                        // 🔥 다른 에러도 그냥 스킵 (참고 코드 패턴)
                        continue; // 패킷 스킵하고 다음 패킷 시도
                    }
                };
                
                match decoder.decode(&packet) {
                    Ok(decoded) => {
                    decoded_ok += 1;
                    
                    let audio_buf = decoded;
                    let frames = audio_buf.frames();
                    
                    // ✅ frames == 0 패킷 처리: encoder delay / gapless / priming frames는 정상
                    // 이런 패킷들은 EOF가 아니므로 그냥 skip하고 다음 패킷으로 넘어감
                    if frames == 0 {
                        // 🔥 정상적인 priming / delay 패킷
                        // ⛔ batch_samples에 아무것도 안 넣음
                        // ⛔ EOF 카운트 증가 ❌
                        // ✅ 그냥 다음 패킷으로 넘어감
                        zero_frame_count += 1;
                        if zero_frame_count > 100 {
                            // 🔥 너무 오래 지속되면 decoder reset (안전장치)
                            eprintln!("Too many consecutive zero-frame packets, resetting decoder");
                            decoder.reset();
                            zero_frame_count = 0;
                        }
                        continue;
                    }
                    // 정상 프레임 수신 시 카운터 리셋
                    zero_frame_count = 0;
                    
                    let channels_count = audio_buf.spec().channels.count() as usize;
                    
                    // f32 버퍼로 변환 (재생용 - 원음 그대로 유지)
                    // ✅ 매 packet마다 재생성하여 프레임 크기 변화에 안전하게 대응
                    // 🔥 핵심: frames가 아니라 capacity로 dest를 만든다
                    // convert()는 frames가 아니라 capacity 기준으로 dest 용량이 충분한지 체크함
                    let spec = *audio_buf.spec();
                    let cap = audio_buf.capacity();
                    let duration = symphonia::core::units::Duration::from(cap as u64);
                    let mut f32_buf = symphonia::core::audio::AudioBuffer::<f32>::new(
                        duration,
                        spec
                    );
                    audio_buf.convert(&mut f32_buf);
                    // ✅ 이후 처리는 frames까지만 사용 (버퍼는 넉넉히 만들고, 실제 사용은 frames까지만)
                    
                    if needs_resampling {
                        // 리샘플러가 없으면 초기화
                        // ✅ 리샘플러는 첫 패킷 frames에 의존하지 않고 고정된 큰 값 사용
                        // 첫 패킷이 작으면 리샘플러 내부 버퍼가 충분히 차지 않아 빈 output 반환
                        if resampler.is_none() {
                            const RESAMPLER_MAX_INPUT: usize = 8192; // ✅ VBR MP3 + delay 패킷 많은 파일에 충분한 값
                            let params = SincInterpolationParameters {
                                sinc_len: 256, // 높은 품질을 위한 긴 sinc 필터
                                f_cutoff: 0.95,
                                interpolation: SincInterpolationType::Linear,
                                oversampling_factor: 256,
                                window: WindowFunction::BlackmanHarris2,
                            };
                            // ✅ 리샘플러는 무조건 2채널로 생성 (채널 수 고정)
                            if let Ok(r) = SincFixedIn::<f32>::new(
                                resample_ratio,
                                2.0,
                                params,
                                RESAMPLER_MAX_INPUT, // ✅ 고정된 값 사용 (첫 패킷 frames에 의존하지 않음)
                                2, // ❗ 항상 2채널
                            ) {
                                resampler = Some(r);
                            }
                        }
                        
                        // 고품질 리샘플링 (FLAC 무손실 재생용)
                        if let Some(ref mut resampler) = resampler {
                            // ✅ 내부 오디오 데이터는 항상 2채널로 통일
                            // 모노인 경우 왼쪽 채널을 오른쪽에도 복사
                            let left: Vec<f32> = if channels_count > 0 {
                                f32_buf.chan(0).iter().take(frames).copied().collect()
                            } else {
                                vec![0.0; frames]
                            };
                            let right: Vec<f32> = if channels_count > 1 {
                                f32_buf.chan(1).iter().take(frames).copied().collect()
                            } else {
                                // 모노인 경우 왼쪽 채널 복사
                                left.clone()
                            };
                            
                            // ✅ 리샘플러 입력은 무조건 2채널
                            let input_channels = vec![left, right];
                            
                            // 리샘플링 수행
                            if let Ok(output_channels) = resampler.process(&input_channels, None) {
                                // ✅ 빈 output 처리: 리샘플러 내부 버퍼가 부족한 경우
                                // 첫 패킷이 작으면 내부 버퍼가 충분히 차지 않아 빈 Vec 반환 가능
                                // ⚠️ continue 제거: 빈 output이어도 다음 패킷에서 누적되면 결국 output 생성됨
                                // 빈 output이면 이번 배치에는 아무것도 추가 안 함 (다음 패킷에서 누적)
                                if !output_channels.is_empty() && !output_channels[0].is_empty() {
                                    // 인터리브된 형식으로 변환 (L, R, L, R, ...)
                                    let output_frames = output_channels[0].len();
                                    let output_channel_count = output_channels.len();
                                    let mut resampled = Vec::with_capacity(output_frames * 2);
                                    for frame_idx in 0..output_frames {
                                        // 왼쪽 채널
                                        resampled.push(output_channels[0][frame_idx]);
                                        // 오른쪽 채널 (있으면 사용, 없으면 왼쪽 채널 복사)
                                        if output_channel_count > 1 {
                                            resampled.push(output_channels[1][frame_idx]);
                                        } else {
                                            resampled.push(output_channels[0][frame_idx]);
                                        }
                                    }
                                    batch_samples.extend(resampled);
                                    // 실제로 batch_samples에 추가된 샘플 수 추적 (나중에 전송 시 카운트)
                                }
                                // 빈 output이면 그냥 다음 패킷으로 진행 (continue 제거)
                            } else {
                                // 리샘플링 실패 시 선형 보간으로 폴백
                                let target_frames = (frames as f64 * resample_ratio) as usize;
                                let mut fallback = Vec::with_capacity(target_frames * 2);
                                for target_idx in 0..target_frames {
                                    let source_pos_f = target_idx as f64 / resample_ratio;
                                    let source_pos = source_pos_f as usize;
                                    let frac = source_pos_f - source_pos as f64;
                                    
                                    if source_pos + 1 < frames {
                                        for ch in 0..2 {
                                            let s0 = if channels_count > ch { f32_buf.chan(ch)[source_pos] } else { 0.0 };
                                            let s1 = if channels_count > ch { f32_buf.chan(ch)[source_pos + 1] } else { 0.0 };
                                            fallback.push(s0 * (1.0 - frac as f32) + s1 * frac as f32);
                                        }
                                    } else if source_pos < frames {
                                        for ch in 0..2 {
                                            let sample = if channels_count > ch { f32_buf.chan(ch)[source_pos] } else { 0.0 };
                                            fallback.push(sample);
                                        }
                                    } else {
                                        fallback.push(0.0);
                                        fallback.push(0.0);
                                    }
                                }
                                batch_samples.extend(fallback);
                                // 실제로 batch_samples에 추가된 샘플 수 추적 (나중에 전송 시 카운트)
                            }
                        } else {
                            // 리샘플러 초기화 실패 시 선형 보간 사용
                            let target_frames = (frames as f64 * resample_ratio) as usize;
                            let mut fallback = Vec::with_capacity(target_frames * 2);
                            for target_idx in 0..target_frames {
                                let source_pos_f = target_idx as f64 / resample_ratio;
                                let source_pos = source_pos_f as usize;
                                let frac = source_pos_f - source_pos as f64;
                                
                                if source_pos + 1 < frames {
                                    for ch in 0..2 {
                                        let s0 = if channels_count > ch { f32_buf.chan(ch)[source_pos] } else { 0.0 };
                                        let s1 = if channels_count > ch { f32_buf.chan(ch)[source_pos + 1] } else { 0.0 };
                                        fallback.push(s0 * (1.0 - frac as f32) + s1 * frac as f32);
                                    }
                                } else if source_pos < frames {
                                    for ch in 0..2 {
                                        let sample = if channels_count > ch { f32_buf.chan(ch)[source_pos] } else { 0.0 };
                                        fallback.push(sample);
                                    }
                                } else {
                                    fallback.push(0.0);
                                    fallback.push(0.0);
                                }
                                }
                                batch_samples.extend(fallback);
                                // 실제로 batch_samples에 추가된 샘플 수 추적 (나중에 전송 시 카운트)
                            }
                    } else {
                        // 리샘플링 불필요: 직접 복사 (원음 그대로 - FLAC 무손실 재생)
                        // ✅ 내부 오디오 데이터는 항상 2채널로 통일 (LR 인터리브)
                        for frame_idx in 0..frames {
                            // ✅ 원본 frames만 사용 (음질 손실 없음)
                            let left_sample = if channels_count > 0 {
                                f32_buf.chan(0)[frame_idx]
                            } else {
                                0.0
                            };
                            let right_sample = if channels_count > 1 {
                                f32_buf.chan(1)[frame_idx]
                            } else {
                                // 모노인 경우 오른쪽 채널에 왼쪽 채널 복사
                                left_sample
                            };
                            // 항상 LR 인터리브로 추가
                            batch_samples.push(left_sample);
                            batch_samples.push(right_sample);
                        }
                        // 실제로 batch_samples에 추가된 샘플 수 추적 (나중에 전송 시 카운트)
                    }
                    }
                    Err(symphonia::core::errors::Error::ResetRequired) => {
                        // ResetRequired는 디코더 상태 문제이므로 reset 후 재시도
                        decoded_err += 1;
                        decoder.reset();
                        continue;
                    }
                    Err(symphonia::core::errors::Error::DecodeError(_)) => {
                        // 🔥 깨진 프레임 스킵 (참고 코드 패턴: reset/seek 없이 단순히 continue)
                        decoded_err += 1;
                        // ✅ 처음 20개는 모두 출력, 이후는 200개마다 출력
                        if decoded_err < 20 || decoded_err % 200 == 0 {
                            eprintln!("decode_err#{}: DecodeError", decoded_err);
                        }
                        continue; // 깨진 프레임 스킵하고 다음 패킷 시도
                    }
                    Err(e) => {
                        // 🔥 기타 디코딩 에러도 그냥 스킵 (참고 코드 패턴)
                        decoded_err += 1;
                        // ✅ 처음 20개는 모두 출력, 이후는 200개마다 출력
                        if decoded_err < 20 || decoded_err % 200 == 0 {
                            eprintln!("decode_err#{}: {:?}", decoded_err, e);
                        }
                        continue; // 패킷 스킵하고 다음 패킷 시도
                    }
                }
            }
            
            // ✅ 배치 전송: send를 사용하여 back-pressure 적용 (디코딩이 출력 속도에 동기화됨)
            // 버퍼가 꽉 차면 디코딩 스레드가 자동으로 대기하여 출력 속도에 맞춤
            if !batch_samples.is_empty() {
                let samples_count = batch_samples.len();
                match tx.send(batch_samples) {
                    Ok(_) => {
                        sent_samples += samples_count as u64;
                        // 성공적으로 전송됨: 새로운 벡터 할당
                        batch_samples = Vec::new();
                    }
                    Err(_) => {
                        // 수신자가 없음: 재생 중지
                        break;
                    }
                }
            }
            
            // ✅ 주기 로그: 2초마다 디코딩 진행 상황 확인 (무음 상황 진단용)
            if last_log.elapsed() > Duration::from_secs(2) {
                eprintln!(
                    "[dbg] ok={}, err={}, sent={}, queue_hint={}",
                    decoded_ok, decoded_err, sent_samples, batch_samples.len()
                );
                last_log = std::time::Instant::now();
            }
        }
        
        // ✅ 루프 종료 시 채널을 명시적으로 닫기 (출력 스레드가 남은 샘플 소비 후 종료)
        eprintln!("Decoding thread: exiting, closing channel");
        eprintln!("Debug stats: decoded_ok={}, decoded_err={}, sent_samples={}", 
            decoded_ok, decoded_err, sent_samples);
        drop(tx);
        // ⛔ 디코딩 스레드에서 is_playing = false 설정하지 않음 (출력 스레드가 처리)
    });
    
    // cpal 스트림 생성
    let stream = match default_config.sample_format() {
        cpal::SampleFormat::F32 => build_stream::<f32>(&device, &config, rx, state.clone())?,
        cpal::SampleFormat::I16 => build_stream::<i16>(&device, &config, rx, state.clone())?,
        cpal::SampleFormat::I32 => build_stream::<i32>(&device, &config, rx, state.clone())?,
        cpal::SampleFormat::I64 => build_stream::<i64>(&device, &config, rx, state.clone())?,
        cpal::SampleFormat::U16 => build_stream::<u16>(&device, &config, rx, state.clone())?,
        format => return Err(format!("Unsupported sample format: {:?}", format)),
    };
    
    stream.play().map_err(|e| format!("Failed to play stream: {}", e))?;
    
    // Stream을 유지해야 재생이 계속됩니다 (drop하면 재생이 중지됨)
    // 재생이 끝날 때까지 대기
    loop {
        thread::sleep(Duration::from_millis(100));
        let state_guard = state.lock().unwrap();
        if state_guard.should_stop || (!state_guard.is_playing && !state_guard.is_paused) {
            break;
        }
    }
    
    // 재생이 끝나면 스트림 정리
    drop(stream);
    
    Ok(())
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    rx: mpsc::Receiver<Vec<f32>>,
    state: Arc<Mutex<PlayerState>>,
) -> Result<cpal::Stream, String>
where
    T: Sample + cpal::FromSample<f32> + cpal::SizedSample,
{
    // 버퍼 사용 (로컬 파일이므로 작은 버퍼로도 충분)
    let sample_rate = config.sample_rate.0 as usize;
    let channels = config.channels as usize;
    let mut sample_queue: VecDeque<f32> = VecDeque::with_capacity(sample_rate * channels); // 채널 수 고려
    let mut last_samples = vec![0.0f32; channels]; // 마지막 샘플 저장 (끊김 방지, 채널별)
    
    // 재생 시작 전에 버퍼를 미리 채우기 (프리로딩)
    // 최소 버퍼 크기: 약 2초 분량 (AIMP처럼 안정적인 재생을 위해)
    let min_buffer_size = sample_rate * 2 * channels; // 2초 분량
    let mut preload_attempts = 0;
    const MAX_PRELOAD_ATTEMPTS: usize = 100; // 프리로딩을 위해 더 많은 시도 허용
    let mut silent_preload_loops = 0; // 빈 샘플 연속 카운트
    
    while sample_queue.len() < min_buffer_size && preload_attempts < MAX_PRELOAD_ATTEMPTS {
        match rx.try_recv() {
            Ok(samples) => {
                if samples.is_empty() {
                    // ✅ 빈 샘플 처리: encoder delay / priming frames로 인한 정상적인 무음 패킷
                    silent_preload_loops += 1;
                    if silent_preload_loops > 50 {
                        // 🔥 더 이상 기다리지 말고 그냥 재생 시작
                        // 초반 무음 패킷이 계속 오는 경우 무한 대기 방지
                        break;
                    }
                    continue; // 빈 샘플은 스킵하고 다음 시도
                }
                sample_queue.extend(samples);
                silent_preload_loops = 0; // 정상 샘플 수신 시 리셋
                preload_attempts = 0; // 성공하면 카운터 리셋
            }
            Err(mpsc::TryRecvError::Empty) => {
                preload_attempts += 1;
                thread::sleep(Duration::from_millis(5)); // 짧게 대기
            }
            Err(mpsc::TryRecvError::Disconnected) => {
                // 채널이 닫혔으면 프리로딩 중단하고 빈 버퍼로 시작
                // 디코딩 스레드가 곧 데이터를 보낼 것이므로 괜찮음
                break;
            }
        }
    }
    
    let stream = device.build_output_stream(
        config,
        move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
            let state_guard = state.lock().unwrap();
            
            if state_guard.should_stop {
                for sample in data.iter_mut() {
                    *sample = T::from_sample(0.0);
                }
                return;
            }
            
            if state_guard.is_paused {
                for sample in data.iter_mut() {
                    *sample = T::from_sample(0.0);
                }
                return;
            }
            
            let volume = state_guard.volume;
            drop(state_guard);
            
            // 버퍼가 부족하면 채널에서 데이터 가져오기
            // recv_timeout을 사용하여 타임아웃을 두어 데드락 방지
            while sample_queue.len() < data.len() {
                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(samples) => {
                        sample_queue.extend(samples);
                        // 디버깅 로그 제거 (너무 많은 로그 출력 방지)
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        // 타임아웃: 버퍼가 비어있으면 마지막 샘플 반복 (끊김 방지)
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        // 채널이 닫혔으면 디코딩이 끝난 것
                        // sample_queue에 남은 샘플이 있으면 계속 재생
                        // 없으면 is_playing을 false로 설정하고 종료
                        if sample_queue.is_empty() {
                            let mut state_check = state.lock().unwrap();
                            if !state_check.should_stop {
                                state_check.is_playing = false;
                            }
                            drop(state_check);
                        }
                        // sample_queue에 샘플이 있으면 계속 재생, 없으면 break
                        break;
                    }
                }
            }
            
            // ✅ 데이터 출력: 내부는 항상 LR 인터리브, 출력 시에만 장치 채널 수에 맞게 복제
            // 내부 데이터 구조: L, R, L, R, ... (항상 2채널)
            // CPAL 출력: 장치 채널 수에 맞게 복제 (1채널→L만, 2채널→LR, 6채널→LRLRLR)
            // ✅ 핵심: frame 단위로 LR을 정확히 1번만 pop, 채널 수는 복제만 함
            let frames = data.len() / channels;
            let mut lr_pairs_outputted = 0u64; // 실제 LR 쌍 수 추적
            
            for frame in 0..frames {
                // 각 frame마다 LR 쌍을 정확히 1번만 pop
                // ✅ 모노 출력(channels == 1)이면 1샘플만 소비, 스테레오 이상이면 LR 2샘플 소비
                let (l, r) = if channels == 1 {
                    // 🔥 모노 출력이면 1샘플만 소비 (L만 pop)
                    let l = sample_queue.pop_front().unwrap_or(last_samples[0]);
                    last_samples[0] = l;
                    last_samples[1] = l; // 내부 상태 유지
                    lr_pairs_outputted += 1;
                    (l, l) // 모노이므로 R도 L과 동일
                } else {
                    // 스테레오 이상: LR 2샘플 소비
                    if sample_queue.len() >= 2 {
                        let l = sample_queue.pop_front().unwrap_or(last_samples[0]);
                        let r = sample_queue.pop_front().unwrap_or(last_samples[1]);
                        last_samples[0] = l;
                        last_samples[1] = r;
                        lr_pairs_outputted += 1;
                        (l, r)
                    } else if sample_queue.len() == 1 {
                        // 마지막 샘플 하나만 남은 경우
                        let l = sample_queue.pop_front().unwrap_or(last_samples[0]);
                        last_samples[0] = l;
                        last_samples[1] = l; // 모노인 경우
                        lr_pairs_outputted += 1;
                        (l, l)
                    } else {
                        // 버퍼 부족: 마지막 샘플 사용
                        (last_samples[0], last_samples[1])
                    }
                };
                
                // 각 채널에 LR 샘플 복제
                for ch in 0..channels {
                    let sample = if ch % 2 == 0 {
                        l // 짝수 채널 = L
                    } else {
                        r // 홀수 채널 = R
                    };
                    data[frame * channels + ch] = T::from_sample(sample * volume);
                }
            }
            
            // ✅ 실제로 출력된 샘플 수 업데이트 (LR 쌍 기준)
            // CPAL은 장치 채널 수만큼 요구하지만, 내부는 LR 쌍 기준
            if lr_pairs_outputted > 0 {
                let actual_samples = lr_pairs_outputted * 2; // LR 쌍 * 2
                let mut state_guard = state.lock().unwrap();
                if !state_guard.is_paused {
                    state_guard.samples_played += actual_samples;
                }
            }
        },
        |err| eprintln!("Stream error: {}", err),
        None,
    ).map_err(|e| format!("Failed to build stream: {}", e))?;
    
    Ok(stream)
}

#[tauri::command]
pub async fn pause_audio() -> Result<(), String> {
    let state_guard = PLAYER_STATE.lock().unwrap();
    if let Some(state) = state_guard.as_ref() {
        let mut player_state = state.lock().unwrap();
        player_state.is_paused = true;
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_audio() -> Result<(), String> {
    let state_guard = PLAYER_STATE.lock().unwrap();
    if let Some(state) = state_guard.as_ref() {
        let mut player_state = state.lock().unwrap();
        player_state.is_paused = false;
        player_state.is_playing = true;
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_audio() -> Result<(), String> {
    let mut state_guard = PLAYER_STATE.lock().unwrap();
    if let Some(state) = state_guard.take() {
        let mut player_state = state.lock().unwrap();
        player_state.should_stop = true;
        player_state.is_playing = false;
        player_state.is_paused = false;
        player_state.samples_played = 0;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn seek_audio(time: f64) -> Result<(), String> {
    let file_path_volume_and_paused = {
        let state_guard = PLAYER_STATE.lock().unwrap();
        if let Some(state) = state_guard.as_ref() {
            let player_state = state.lock().unwrap();
            if let Some(file_path) = &player_state.current_file {
                Some((file_path.clone(), player_state.volume, player_state.is_paused))
            } else {
                None
            }
        } else {
            None
        }
    };
    
    if let Some((file_path, volume, was_paused)) = file_path_volume_and_paused {
        // 일시정지 상태를 유지하기 위해 play_audio 후에 다시 일시정지
        play_audio(file_path, volume, Some(time)).await?;
        
        // 일시정지 상태였으면 다시 일시정지
        if was_paused {
            pause_audio().await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_volume(volume: f32) -> Result<(), String> {
    let state_guard = PLAYER_STATE.lock().unwrap();
    if let Some(state) = state_guard.as_ref() {
        let mut player_state = state.lock().unwrap();
        player_state.volume = volume.max(0.0).min(1.0);
    }
    
    // 볼륨을 데이터베이스에 저장
    let conn = get_connection().map_err(|e| e.to_string())?;
    let volume_percent = (volume * 100.0) as i32;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        ["volume", &volume_percent.to_string()],
    )
    .map_err(|e| format!("Failed to save volume: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_saved_volume() -> Result<f32, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    
    let volume_result = stmt
        .query_row(["volume"], |row| {
            let value: String = row.get(0)?;
            Ok(value)
        });
    
    match volume_result {
        Ok(value_str) => {
            let volume_percent: i32 = value_str.parse()
                .map_err(|e| format!("Failed to parse volume: {}", e))?;
            Ok((volume_percent as f32) / 100.0)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // 저장된 볼륨이 없으면 기본값 반환
            Ok(0.5)
        }
        Err(e) => Err(format!("Failed to get volume: {}", e)),
    }
}
