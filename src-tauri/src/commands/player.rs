use std::fs::File;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::thread;
use std::time::Duration;
use std::sync::mpsc;
use std::collections::VecDeque;
use std::mem;
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

// 실시간 오디오 콜백용 Atomic 상태 (Mutex 없이 접근 가능)
struct RtState {
    should_stop: AtomicBool,
    is_paused: AtomicBool,
    volume: AtomicU32, // f32를 u32 bits로 저장
    samples_played: AtomicU64, // 프레임 수 (채널 수와 무관)
}

impl RtState {
    fn new(volume: f32) -> Self {
        Self {
            should_stop: AtomicBool::new(false),
            is_paused: AtomicBool::new(false),
            volume: AtomicU32::new(volume.to_bits()),
            samples_played: AtomicU64::new(0),
        }
    }
    
    fn get_volume(&self) -> f32 {
        f32::from_bits(self.volume.load(Ordering::Relaxed))
    }
    
    fn set_volume(&self, vol: f32) {
        self.volume.store(vol.to_bits(), Ordering::Relaxed);
    }
}

// ✅ RT 콜백에서 사용하는 전역 디버그 상태 (모듈 스코프로 명확히)
static DISCONNECT_LOGGED: AtomicBool = AtomicBool::new(false);
static VOLUME_LOG_COUNT: AtomicU32 = AtomicU32::new(0);

// 플레이어 상태 (비실시간 접근용)
struct PlayerState {
    is_playing: bool,
    is_paused: bool,
    current_file: Option<String>,
    volume: f32,
    seek_time: Option<f64>,
    samples_played: u64, // 실제로 오디오 스트림에서 출력된 프레임 수 (채널 수와 무관)
    rt_state: Option<Arc<RtState>>, // 실시간 상태 참조
    // ✅ should_stop은 rt_state.should_stop만 사용 (중복 제거)
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            is_playing: false,
            is_paused: false,
            current_file: None,
            volume: 0.5,
            seek_time: None,
            samples_played: 0,
            rt_state: None,
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
    // ✅ samples == 0 방어: 언더플로우 및 인덱스 오류 방지
    if samples == 0 {
        return Err("samples must be > 0".to_string());
    }
    
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
            
            // ✅ cap 상한 체크: 1~2초 분량으로 제한 (악성 파일 방어)
            let cap_limit = (sample_rate * 2).max(8192); // 2초 or 최소 8192
            
            // cap이 상한을 넘으면 부분 처리 (스킵하지 않고 limit만큼만 사용)
            let safe_cap = cap.min(cap_limit);
            if cap > cap_limit {
                eprintln!("Warning: waveform extraction - packet capacity {} exceeds limit {}, using limit", cap, cap_limit);
            }
            
            // ✅ safe_frames: frames가 safe_cap보다 클 수 있으므로 안전하게 제한
            let safe_frames = frames.min(safe_cap);
            let duration = symphonia::core::units::Duration::from(safe_cap as u64);
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
            
            // 모든 채널의 평균을 계산하여 모노로 변환하면서 RMS 누적 (safe_frames만 사용)
            for frame_idx in 0..safe_frames {
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
    // ✅ 기존 재생 중지 및 완전 종료 대기
    stop_audio().await.ok();
    
    let rt_state = Arc::new(RtState::new(volume.max(0.0).min(1.0)));
    let state = Arc::new(Mutex::new(PlayerState {
        is_playing: true,
        is_paused: false,
        current_file: Some(file_path.clone()),
        volume: volume.max(0.0).min(1.0),
        seek_time,
        samples_played: 0,
        rt_state: Some(rt_state.clone()),
    }));
    
    *PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))? = Some(state.clone());
    
    // ✅ 재생 스레드 시작
    let _handle = thread::spawn(move || {
        if let Err(e) = play_audio_thread(file_path, state) {
            eprintln!("Audio playback error: {}", e);
        }
    });
    
    Ok(())
}

fn play_audio_thread(file_path: String, state: Arc<Mutex<PlayerState>>) -> Result<(), String> {
    // rt_state 추출
    let rt_state = {
        let state_guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        state_guard.rt_state.clone().ok_or_else(|| "RtState not initialized".to_string())?
    };
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
    // ✅ expected_duration은 현재 미사용 (향후 필요 시 재추가 가능)
    
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
    
    // ✅ initial_packet_time 제거: _current_packet_time 미사용으로 불필요
    if seek_result.is_ok() {
        // Seek 성공 시 디코더 리셋 및 카운터 초기화
        decoder.reset();
        // Seek 시 samples_played를 반드시 초기화 (프레임 기준)
        let expected_frames = (seek_time * target_sample_rate as f64) as u64;
        rt_state.samples_played.store(expected_frames, Ordering::Relaxed);
        {
            let mut state_guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
            state_guard.samples_played = expected_frames;
        }
        eprintln!("Seek to {:.2}s successful (initialization, frames: {})", 
            seek_time, expected_frames);
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
            rt_state.samples_played.store(0, Ordering::Relaxed);
            {
                let mut state_guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
                state_guard.samples_played = 0;
            }
            eprintln!("Seek to 0.0s successful (initialization, frames: 0)");
        } else {
            eprintln!("Seek to 0.0 also failed, continuing from current position");
        }
    }
    
    // 채널을 통한 오디오 데이터 전달 (bounded channel로 버퍼 크기 제한)
    // ✅ Vec 개수 기준으로 현실적인 크기 설정 (각 Vec는 BATCH_MAX_SAMPLES로 제한됨)
    // 256개 Vec = 약 256 * 16384 * 2 = 8M 샘플 = 약 90초 분량 (44.1kHz 기준)
    let buffer_size = 256; // Vec 메시지 개수 (BATCH_MAX로 각 Vec 크기 제한)
    let (tx, rx) = mpsc::sync_channel::<Vec<f32>>(buffer_size);
    
    // 디코딩 스레드 (format과 decoder를 클로저로 이동)
    let _state_clone = state.clone();
    let rt_state_clone = rt_state.clone(); // ✅ 디코딩 스레드에서 사용
    let mut format_reader = probed.format;
    let needs_resampling = source_sample_rate != target_sample_rate;
    let resample_ratio = if needs_resampling {
        target_sample_rate as f64 / source_sample_rate as f64
    } else {
        1.0
    };
    
    // 클로저로 이동할 변수들
    let audio_track_id = track_id; // ✅ 오디오 트랙 ID (다른 트랙 패킷 스킵용)
    // ✅ target_sample_rate는 build_stream에서 직접 사용하므로 클로저로 이동 불필요
    // ✅ codec_params_clone, initial_packet_time_clone 제거: _current_packet_time 미사용으로 불필요
    let needs_resampling_clone = needs_resampling; // EOF에서 리샘플러 flush를 위해 필요
    
    // 여러 패킷을 배치로 처리하여 효율성 향상
    thread::spawn(move || {
        const BATCH_SIZE: usize = 1;
        // ✅ MAX_PACKET_SCAN을 크게 늘림 (앨범아트/메타 트랙이 많은 파일 대응)
        const MAX_PACKET_SCAN: usize = 10000;
        // ✅ 리샘플러 고정 입력 프레임 크기
        const RS_IN_FRAMES: usize = 8192;
        // ✅ pending 최대 길이 상한 (메모리 폭증 방지)
        const PENDING_MAX: usize = RS_IN_FRAMES * 20; // 약 20블록 분량
        // ✅ batch_samples 최대 크기 (한 번에 보내는 샘플 수 제한)
        const BATCH_MAX_SAMPLES: usize = 16384 * 2; // 16384 프레임 * 2채널 (LR)

        let mut batch_samples: Vec<f32> = Vec::new();
        let mut resampler: Option<SincFixedIn<f32>> = None;
        // ✅ pending 버퍼: 리샘플러에 고정 크기 블록을 전달하기 위한 누적 버퍼
        let mut pending_l: VecDeque<f32> = VecDeque::with_capacity(RS_IN_FRAMES * 3);
        let mut pending_r: VecDeque<f32> = VecDeque::with_capacity(RS_IN_FRAMES * 3);
        // ✅ _current_packet_time 제거: 현재 미사용 (향후 UI 이벤트 필요 시 재추가 가능)
        let mut zero_frame_count = 0u32;

        // 디버깅 카운터
        let mut decoded_ok = 0u64;
        let mut decoded_err = 0u64;
        let mut sent_samples = 0u64;
        let mut last_log = std::time::Instant::now();
        let mut last_pending_warn = std::time::Instant::now(); // ✅ pending 경고 쿨다운
        let mut last_flush = std::time::Instant::now(); // ✅ 시간 기반 flush
        const FLUSH_INTERVAL: Duration = Duration::from_millis(30); // 30ms마다 flush
        const MIN_FLUSH_SAMPLES: usize = 1024 * 2; // 최소 1024 프레임 * 2 (LR) - 메시지 폭발 방지
        const FORCE_FLUSH_INTERVAL: Duration = Duration::from_millis(200); // 200ms 경과 시 MIN_FLUSH 무시하고 강제 전송 (방탄 백업)

        'decode_loop: loop {
            if rt_state_clone.should_stop.load(Ordering::Relaxed) {
                break 'decode_loop;
            }

            // ✅ batch_samples.clear() 제거: 샘플을 누적하다가 임계치 넘으면 전송

            for _ in 0..BATCH_SIZE {
                // ✅ 오디오 트랙 패킷을 찾을 때까지 스캔 (시간 기준으로 변경)
                let scan_start = std::time::Instant::now();
                let scan_timeout = Duration::from_millis(500); // 500ms 동안 스캔
                let mut attempts = 0usize;
                let mut warned_timeout = false; // ✅ 경고는 루프당 1회만
                let mut warned_max = false; // ✅ MAX_PACKET_SCAN 경고도 1회만
                let packet = loop {
                    attempts += 1;
                    // 시간 기준 체크 (너무 많은 비오디오 패킷이 있어도 계속 시도)
                    if !warned_timeout && scan_start.elapsed() > scan_timeout && attempts > 100 {
                        eprintln!("Warning: audio packet scan timeout after {} attempts, continuing anyway", attempts);
                        warned_timeout = true; // 한 번만 경고
                    }
                    if !warned_max && attempts > MAX_PACKET_SCAN {
                        eprintln!("Warning: exceeded MAX_PACKET_SCAN={}, but continuing scan", MAX_PACKET_SCAN);
                        warned_max = true; // 한 번만 경고
                    }

                    match format_reader.next_packet() {
                        Ok(packet) => {
                            if packet.track_id() == audio_track_id {
                                break packet;
                            }
                            continue;
                        }
                        Err(symphonia::core::errors::Error::ResetRequired) => {
                            decoder.reset();
                            continue;
                        }
                        Err(symphonia::core::errors::Error::IoError(ref io_err))
                            if io_err.kind() == std::io::ErrorKind::UnexpectedEof =>
                        {
                            eprintln!("Decoder reached EOF (file fully consumed)");

                            // ✅ EOF 처리: pending 잔여 처리 + flush
                            if needs_resampling_clone {
                                // (A) pending이 남아있으면 0-padding으로 RS_IN_FRAMES 채워서 1회 처리
                                if !pending_l.is_empty() || !pending_r.is_empty() {
                                    let mut in_l = Vec::with_capacity(RS_IN_FRAMES);
                                    let mut in_r = Vec::with_capacity(RS_IN_FRAMES);

                                    while in_l.len() < RS_IN_FRAMES {
                                        in_l.push(pending_l.pop_front().unwrap_or(0.0));
                                        in_r.push(pending_r.pop_front().unwrap_or(0.0));
                                    }

                                    let input_channels = vec![in_l, in_r];
                                    if let Some(ref mut rs) = resampler {
                                        if let Ok(out) = rs.process(&input_channels, None) {
                                            if !out.is_empty() && !out[0].is_empty() {
                                                let out_frames = out[0].len();
                                                let has_r = out.len() > 1;
                                                for i in 0..out_frames {
                                                    batch_samples.push(out[0][i]);
                                                    batch_samples.push(if has_r { out[1][i] } else { out[0][i] });
                                                }
                                            }
                                        }
                                    }
                                }

                                // (B) 그리고 flush
                                if let Some(ref mut rs) = resampler {
                                    let flush_flags = [true, true];
                                    let empty_input: Vec<Vec<f32>> = vec![vec![], vec![]];
                                    if let Ok(out) = rs.process(&empty_input, Some(&flush_flags)) {
                                        if !out.is_empty() && !out[0].is_empty() {
                                            let out_frames = out[0].len();
                                            let has_r = out.len() > 1;
                                            for i in 0..out_frames {
                                                batch_samples.push(out[0][i]);
                                                batch_samples.push(if has_r { out[1][i] } else { out[0][i] });
                                            }
                                        }
                                    }
                                }
                            } else {
                                // 리샘플링 없을 때도 pending 처리
                                while let (Some(l), Some(r)) = (pending_l.pop_front(), pending_r.pop_front()) {
                                    batch_samples.push(l);
                                    batch_samples.push(r);
                                }
                            }

                            // ✅ EOF에서도 mem::take로 통째 전송 (복사 비용 제거)
                            if !batch_samples.is_empty() {
                                let out = mem::take(&mut batch_samples);
                                let _ = tx.send(out);
                            }
                            break 'decode_loop;
                        }
                        Err(_) => continue,
                    }
                };

                // ✅ packet_ts, time_base 사용 제거: _current_packet_time 미사용으로 불필요

                match decoder.decode(&packet) {
                    Ok(decoded) => {
                        decoded_ok += 1;
                        let audio_buf = decoded;
                        let frames = audio_buf.frames();

                        if frames == 0 {
                            zero_frame_count += 1;
                            if zero_frame_count > 100 {
                                eprintln!("Too many consecutive zero-frame packets, resetting decoder");
                                decoder.reset();
                                zero_frame_count = 0;
                            }
                            continue;
                        }
                        zero_frame_count = 0;

                        let channels_count = audio_buf.spec().channels.count() as usize;
                        let spec = *audio_buf.spec();
                        let cap = audio_buf.capacity();

                        // ✅ cap 이상치 방어: 재생 경로에서는 완화 (정상 FLAC도 스킵하지 않도록)
                        // waveform 추출과 달리 재생에서는 cap을 믿고 버퍼를 만들되, 메모리 폭탄만 방어
                        let cap_limit = (source_sample_rate as usize * 30).max(8192); // 30초 분량 or 최소 8192
                        if cap > cap_limit {
                            eprintln!("Warning: packet capacity {} exceeds limit {}, using limit", cap, cap_limit);
                            // 스킵하지 않고 cap_limit만큼만 사용
                        }

                        let safe_cap = cap.min(cap_limit);
                        // ✅ safe_frames: frames가 safe_cap보다 클 수 있으므로 안전하게 제한
                        let safe_frames = frames.min(safe_cap);
                        let duration = symphonia::core::units::Duration::from(safe_cap as u64);
                        let mut f32_buf = symphonia::core::audio::AudioBuffer::<f32>::new(duration, spec);
                        audio_buf.convert(&mut f32_buf);

                        // ✅ (C) 디코딩 후 샘플을 pending에 누적 (safe_frames만 사용)
                        for fi in 0..safe_frames {
                            let (l, r) = if channels_count > 2 {
                                // 멀티채널 다운믹스 -> mono -> LR
                                let mut sum = 0.0f32;
                                for ch in 0..channels_count {
                                    sum += f32_buf.chan(ch)[fi];
                                }
                                let mono = sum / channels_count as f32;
                                (mono, mono)
                            } else if channels_count == 1 {
                                let v = f32_buf.chan(0)[fi];
                                (v, v)
                            } else {
                                (f32_buf.chan(0)[fi], f32_buf.chan(1)[fi])
                            };

                            pending_l.push_back(l);
                            pending_r.push_back(r);
                        }
                        
                        // ✅ (A) pending 상한 체크는 패킷 처리 후 한 번만 (로그는 쿨다운으로 제한)
                        if pending_l.len() > PENDING_MAX || pending_r.len() > PENDING_MAX {
                            // 가장 오래된 샘플 drop
                            while pending_l.len() > PENDING_MAX {
                                pending_l.pop_front();
                            }
                            while pending_r.len() > PENDING_MAX {
                                pending_r.pop_front();
                            }
                            // ✅ 로그는 1초에 1번만
                            if last_pending_warn.elapsed() > Duration::from_secs(1) {
                                eprintln!("Warning: pending buffer exceeded limit, dropping oldest samples");
                                last_pending_warn = std::time::Instant::now();
                            }
                        }

                        // ✅ 리샘플링 처리
                        if needs_resampling {
                            // (B) resampler 초기화: RS_IN_FRAMES로 고정
                            if resampler.is_none() {
                                // ✅ SincInterpolationType::Linear는 sinc 커널 계산 시 내부 보간 방식
                                // (선형 보간 리샘플러가 아님 - sinc 기반 고품질 리샘플러)
                                let params = SincInterpolationParameters {
                                    sinc_len: 256,
                                    f_cutoff: 0.95,
                                    interpolation: SincInterpolationType::Linear, // sinc 내부 테이블 보간 방식
                                    oversampling_factor: 256,
                                    window: WindowFunction::BlackmanHarris2,
                                };
                                match SincFixedIn::<f32>::new(resample_ratio, 2.0, params, RS_IN_FRAMES, 2) {
                                    Ok(r) => {
                                        resampler = Some(r);
                                    }
                                    Err(e) => {
                                        eprintln!("[resample_init_err] {:?}", e);
                                        // 초기화 실패 시 리샘플링 없이 진행
                                    }
                                }
                            }

                            // ✅ (D) pending이 RS_IN_FRAMES 이상 모이면 "딱 RS_IN_FRAMES만" 뽑아서 process
                            while pending_l.len() >= RS_IN_FRAMES && pending_r.len() >= RS_IN_FRAMES {
                                // 고정 길이 블록 만들기
                                let mut in_l = Vec::with_capacity(RS_IN_FRAMES);
                                let mut in_r = Vec::with_capacity(RS_IN_FRAMES);
                                for _ in 0..RS_IN_FRAMES {
                                    in_l.push(pending_l.pop_front().unwrap());
                                    in_r.push(pending_r.pop_front().unwrap());
                                }

                                let input_channels = vec![in_l, in_r];

                                if let Some(ref mut rs) = resampler {
                                    match rs.process(&input_channels, None) {
                                        Ok(out) => {
                                            // out[0] = L, out[1] = R (보통 2채널)
                                            if !out.is_empty() && !out[0].is_empty() {
                                                let out_frames = out[0].len();
                                                let has_r = out.len() > 1;

                                                // batch_samples는 LR 인터리브로
                                                batch_samples.reserve(out_frames * 2);
                                                for i in 0..out_frames {
                                                    batch_samples.push(out[0][i]);
                                                    batch_samples.push(if has_r { out[1][i] } else { out[0][i] });
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            // 리샘플러 에러: reset하고 계속
                                            eprintln!("[resample_err] {:?} (reset resampler)", e);
                                            resampler = None;
                                        }
                                    }
                                }
                            }
                        } else {
                            // ✅ (B) 리샘플링 없음: pending에서 batch_samples로
                            // (batch_samples는 루프 끝에서 최대 크기로 잘라서 여러 번 전송)
                            while let (Some(l), Some(r)) = (pending_l.pop_front(), pending_r.pop_front()) {
                                batch_samples.push(l);
                                batch_samples.push(r);
                            }
                        }
                    }
                    Err(symphonia::core::errors::Error::ResetRequired) => {
                        decoded_err += 1;
                        decoder.reset();
                        continue;
                    }
                    Err(_) => {
                        decoded_err += 1;
                        continue;
                    }
                }
            }

            // ✅ (B) batch_samples가 BATCH_MAX_SAMPLES 이상이면 고정 크기로 전송 (성능 최적화: split_off + mem::take)
            // ✅ while 루프로 여러 번 전송 가능 (큰 덩어리가 쌓였을 때 대응)
            // ✅ >= 조건으로 딱 맞게 쌓인 경우도 즉시 전송 (예측 가능성 향상)
            while batch_samples.len() >= BATCH_MAX_SAMPLES {
                // split_off로 나머지 분리 후 mem::take로 정확히 BATCH_MAX_SAMPLES만 전송 (복사/할당 최소화)
                let rest = batch_samples.split_off(BATCH_MAX_SAMPLES);
                let out = mem::take(&mut batch_samples); // 정확히 BATCH_MAX_SAMPLES
                let send_count = out.len();
                if tx.send(out).is_ok() {
                    sent_samples += send_count as u64;
                } else {
                    // 수신자가 없음: 재생 중지
                    break 'decode_loop;
                }
                batch_samples = rest; // 나머지로 교체
            }
            
            // ✅ 시간 기반 flush: BATCH_MAX에 못 미쳐도 일정 주기로 전송 (초반 무음/지연 방지)
            // ✅ 최소 샘플 수 하한으로 메시지 폭발 방지
            // ✅ FORCE_FLUSH_INTERVAL 백업 규칙: 200ms 경과 시 MIN_FLUSH 무시하고 강제 전송 (방탄)
            let flush_elapsed = last_flush.elapsed();
            let should_flush = if flush_elapsed >= FORCE_FLUSH_INTERVAL {
                // 200ms 경과 시 MIN_FLUSH 무시하고 강제 전송 (이상 케이스 대비)
                !batch_samples.is_empty()
            } else if flush_elapsed >= FLUSH_INTERVAL {
                // 30ms 경과 + MIN_FLUSH 이상일 때만 전송
                batch_samples.len() >= MIN_FLUSH_SAMPLES
            } else {
                false
            };
            
            if should_flush {
                let out = mem::take(&mut batch_samples);
                let send_count = out.len();
                if tx.send(out).is_ok() {
                    sent_samples += send_count as u64;
                } else {
                    // 수신자가 없음: 재생 중지
                    break 'decode_loop;
                }
                last_flush = std::time::Instant::now();
            }

            if last_log.elapsed() > Duration::from_secs(2) {
                eprintln!("[dbg] ok={}, err={}, sent={}, batch={}", decoded_ok, decoded_err, sent_samples, batch_samples.len());
                last_log = std::time::Instant::now();
            }
        }

        // ✅ 루프 종료 시 남은 batch_samples 전송
        if !batch_samples.is_empty() {
            let out = mem::take(&mut batch_samples);
            let send_count = out.len();
            if tx.send(out).is_ok() {
                sent_samples += send_count as u64;
            }
        }
        
        eprintln!("Decoding thread: exiting, closing channel");
        eprintln!("Debug stats: decoded_ok={}, decoded_err={}, sent_samples={}", decoded_ok, decoded_err, sent_samples);
        drop(tx);
    });
    
    // cpal 스트림 생성 (rt_state 전달)
    let stream = match default_config.sample_format() {
        cpal::SampleFormat::F32 => build_stream::<f32>(&device, &config, rx, rt_state.clone(), target_sample_rate)?,
        cpal::SampleFormat::I16 => build_stream::<i16>(&device, &config, rx, rt_state.clone(), target_sample_rate)?,
        cpal::SampleFormat::I32 => build_stream::<i32>(&device, &config, rx, rt_state.clone(), target_sample_rate)?,
        cpal::SampleFormat::I64 => build_stream::<i64>(&device, &config, rx, rt_state.clone(), target_sample_rate)?,
        cpal::SampleFormat::U16 => build_stream::<u16>(&device, &config, rx, rt_state.clone(), target_sample_rate)?,
        format => return Err(format!("Unsupported sample format: {:?}", format)),
    };
    
    stream.play().map_err(|e| format!("Failed to play stream: {}", e))?;
    
    // Stream을 유지해야 재생이 계속됩니다 (drop하면 재생이 중지됨)
    // 재생이 끝날 때까지 대기
    loop {
        thread::sleep(Duration::from_millis(100));
        // ✅ Atomic으로 빠른 체크
        if rt_state.should_stop.load(Ordering::Relaxed) {
            break;
        }
        // is_playing은 Mutex로 체크 (비실시간)
        let state_guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        if !state_guard.is_playing && !rt_state.is_paused.load(Ordering::Relaxed) {
            drop(state_guard);
            break;
        }
        drop(state_guard);
    }
    
    // 재생이 끝나면 스트림 정리
    drop(stream);
    
    Ok(())
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    rx: mpsc::Receiver<Vec<f32>>,
    rt_state: Arc<RtState>,
    _target_sample_rate: u32,
) -> Result<cpal::Stream, String>
where
    T: Sample + cpal::FromSample<f32> + cpal::SizedSample,
{
    // 버퍼 사용 (로컬 파일이므로 작은 버퍼로도 충분)
    let sample_rate = config.sample_rate.0 as usize;
    let channels = config.channels as usize;
    // ✅ 내부는 항상 LR 2채널 고정이므로 sample_rate * 2로 설정
    let mut sample_queue: VecDeque<f32> = VecDeque::with_capacity(sample_rate * 2);
    // ✅ last_lr: 항상 2개 고정 (LR) - 모노 출력에서도 안전하게 접근
    let mut last_lr = [0.0f32, 0.0f32]; // 마지막 LR 샘플 저장 (끊김 방지)
    
    // 재생 시작 전에 버퍼를 미리 채우기 (프리로딩)
    // 최소 버퍼 크기: 약 2초 분량 (AIMP처럼 안정적인 재생을 위해)
    // ✅ 프레임 기준으로 계산 (내부는 항상 LR 2채널)
    let min_frames = sample_rate * 2; // 2초 분량의 프레임 수
    let min_buffer_size = min_frames * 2; // LR 인터리브 (2채널)
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
            // ✅ Atomic으로 빠른 체크 (Mutex 없음 - 드롭아웃/지터 방지)
            if rt_state.should_stop.load(Ordering::Relaxed) {
                for sample in data.iter_mut() {
                    *sample = T::from_sample(0.0);
                }
                return;
            }
            
            if rt_state.is_paused.load(Ordering::Relaxed) {
                for sample in data.iter_mut() {
                    *sample = T::from_sample(0.0);
                }
                return;
            }
            
            let volume = rt_state.get_volume();
            
            // ✅ 버퍼가 부족하면 채널에서 데이터 가져오기 (non-blocking)
            // RT 콜백에서는 블로킹하지 않음 - try_recv만 사용
            // ✅ 프레임 기준으로 계산 (내부는 LR 2채널, 출력 장치 채널 수와 무관)
            let frames = data.len() / channels;
            let need_lr = frames * 2; // LR 인터리브
            while sample_queue.len() < need_lr {
                match rx.try_recv() {
                    Ok(samples) => {
                        sample_queue.extend(samples);
                    }
                    Err(mpsc::TryRecvError::Empty) => {
                        // 버퍼가 비어있으면 마지막 샘플 반복 (끊김 방지)
                        break;
                    }
                    Err(mpsc::TryRecvError::Disconnected) => {
                        // 채널이 닫혔으면 디코이 끝난 것
                        // sample_queue에 남은 샘플이 있으면 계속 재생
                        // ✅ 디버그: 연결 끊김은 한 번만 로그 (모듈 스코프의 Atomic 사용)
                        if DISCONNECT_LOGGED.compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
                            eprintln!("[rt] rx disconnected");
                        }
                        break;
                    }
                }
            }
            
            // ✅ 디버그: 볼륨 확인 (처음 몇 번만, 모듈 스코프의 Atomic 사용)
            let count = VOLUME_LOG_COUNT.fetch_add(1, Ordering::Relaxed);
            if count < 3 {
                eprintln!("[rt] volume={}, queue_len={}", volume, sample_queue.len());
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
                    let l = sample_queue.pop_front().unwrap_or(last_lr[0]);
                    last_lr[0] = l;
                    last_lr[1] = l; // 내부 상태 유지
                    lr_pairs_outputted += 1;
                    (l, l) // 모노이므로 R도 L과 동일
                } else {
                    // 스테레오 이상: LR 2샘플 소비
                    if sample_queue.len() >= 2 {
                        let l = sample_queue.pop_front().unwrap_or(last_lr[0]);
                        let r = sample_queue.pop_front().unwrap_or(last_lr[1]);
                        last_lr[0] = l;
                        last_lr[1] = r;
                        lr_pairs_outputted += 1;
                        (l, r)
                    } else if sample_queue.len() == 1 {
                        // 마지막 샘플 하나만 남은 경우
                        let l = sample_queue.pop_front().unwrap_or(last_lr[0]);
                        last_lr[0] = l;
                        last_lr[1] = l; // 모노인 경우
                        lr_pairs_outputted += 1;
                        (l, l)
                    } else {
                        // 버퍼 부족: 마지막 샘플 사용
                        (last_lr[0], last_lr[1])
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
            
            // ✅ 프레임 기반으로 samples_played 업데이트 (채널 수와 무관)
            // Atomic으로 빠른 업데이트 (Mutex 없음)
            if lr_pairs_outputted > 0 {
                let frames_outputted = lr_pairs_outputted; // 프레임 수 (LR 쌍 = 1 프레임)
                if !rt_state.is_paused.load(Ordering::Relaxed) {
                    rt_state.samples_played.fetch_add(frames_outputted, Ordering::Relaxed);
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
    let state_guard = PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(state) = state_guard.as_ref() {
        let rt_state_opt = {
            let mut player_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
            player_state.is_paused = true;
            player_state.rt_state.clone()
        };
        // rt_state도 업데이트
        if let Some(rt_state) = rt_state_opt {
            rt_state.is_paused.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_audio() -> Result<(), String> {
    let state_guard = PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(state) = state_guard.as_ref() {
        let rt_state_opt = {
            let mut player_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
            player_state.is_paused = false;
            player_state.is_playing = true;
            player_state.rt_state.clone()
        };
        // rt_state도 업데이트
        if let Some(rt_state) = rt_state_opt {
            rt_state.is_paused.store(false, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_audio() -> Result<(), String> {
    // ✅ rt_state를 먼저 설정하여 콜백이 즉시 중지되도록 함
    let rt_state_opt = {
        let state_guard = PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(state) = state_guard.as_ref() {
            state.lock().map_err(|e| format!("Lock error: {}", e))?.rt_state.clone()
        } else {
            None
        }
    };
    
    if let Some(rt_state) = rt_state_opt {
        rt_state.should_stop.store(true, Ordering::Relaxed);
        rt_state.is_paused.store(false, Ordering::Relaxed);
        rt_state.samples_played.store(0, Ordering::Relaxed);
    }
    
    // ✅ 상태 업데이트 후 짧은 대기 (콜백이 should_stop을 확인할 시간)
    // 주의: 이 sleep은 타이밍에 의존하는 안전망 역할
    // 실제 동기화는 rt_state.should_stop + stream drop으로 보장됨
    thread::sleep(Duration::from_millis(50));
    
    let mut state_guard = PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(state) = state_guard.take() {
        let mut player_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        player_state.is_playing = false;
        player_state.is_paused = false;
        player_state.samples_played = 0;
        // rt_state.should_stop은 이미 위에서 설정됨
    }
    
    Ok(())
}

#[tauri::command]
pub async fn seek_audio(time: f64) -> Result<(), String> {
    let file_path_volume_and_paused = {
        let state_guard = PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(state) = state_guard.as_ref() {
            let player_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
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

// ✅ 볼륨 DB 저장용 debounce 타이머
static VOLUME_SAVE_MUTEX: Mutex<Option<std::time::Instant>> = Mutex::new(None);

#[tauri::command]
pub async fn set_volume(volume: f32) -> Result<(), String> {
    let clamped_volume = volume.max(0.0).min(1.0);
    
    // ✅ 메모리에 즉시 반영 (rt_state 포함)
    let _rt_state_opt = {
        let state_guard = PLAYER_STATE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(state) = state_guard.as_ref() {
            let rt_state_opt = {
                let mut player_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
                player_state.volume = clamped_volume;
                player_state.rt_state.clone()
            };
            // rt_state도 즉시 업데이트
            if let Some(rt_state) = &rt_state_opt {
                rt_state.set_volume(clamped_volume);
            }
            rt_state_opt
        } else {
            None
        }
    };
    
    // ✅ DB 저장은 debounce (300ms 후 마지막 값만 저장)
    {
        let mut timer_guard = VOLUME_SAVE_MUTEX.lock().map_err(|e| format!("Lock error: {}", e))?;
        *timer_guard = Some(std::time::Instant::now());
    }
    
    // 별도 스레드에서 debounce 처리
    let volume_to_save = clamped_volume;
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(300));
        let mut timer_guard = match VOLUME_SAVE_MUTEX.lock() {
            Ok(guard) => guard,
            Err(_) => return, // 뮤텍스 포이즌 시 스킵
        };
        
        if let Some(timer) = *timer_guard {
            if timer.elapsed() >= Duration::from_millis(300) {
                // 마지막 값 저장
                if let Ok(conn) = get_connection() {
                    let volume_percent = (volume_to_save * 100.0) as i32;
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
                        ["volume", &volume_percent.to_string()],
                    );
                }
                *timer_guard = None;
            }
        }
    });
    
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
