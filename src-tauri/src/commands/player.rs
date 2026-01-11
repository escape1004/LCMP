use std::fs::File;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::sync::mpsc;
use std::collections::VecDeque;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::codecs::CODEC_TYPE_NULL;
use symphonia::default::get_probe;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::audio::Signal;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Sample;
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};

// 플레이어 상태
struct PlayerState {
    is_playing: bool,
    is_paused: bool,
    current_file: Option<String>,
    volume: f32,
    seek_time: Option<f64>,
    should_stop: bool,
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
pub async fn play_audio(file_path: String, volume: f32, seek_time: Option<f64>) -> Result<(), String> {
    stop_audio().await.ok();
    
    let state = Arc::new(Mutex::new(PlayerState {
        is_playing: true,
        is_paused: false,
        current_file: Some(file_path.clone()),
        volume: volume.max(0.0).min(1.0),
        seek_time,
        should_stop: false,
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
    
    let track = probed.format.tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No valid audio track found".to_string())?;
    
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    
    // CodecParameters에서 샘플 레이트 가져오기
    let source_sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    
    let host = cpal::default_host();
    let device = host.default_output_device()
        .ok_or_else(|| "No output device available".to_string())?;
    
    let config = device.default_output_config()
        .map_err(|e| format!("Failed to get default output config: {}", e))?;
    
    let target_sample_rate = config.sample_rate().0 as u32;
    
    // Seek 처리
    if let Some(seek_time) = state.lock().unwrap().seek_time {
        if let Some(time_base) = track.codec_params.time_base {
            let seek_ts = (seek_time * time_base.denom as f64 / time_base.numer as f64) as u64;
            probed.format.seek(symphonia::core::formats::SeekMode::Accurate, symphonia::core::formats::SeekTo::Time { 
                track_id: Some(track.id),
                time: symphonia::core::units::Time::new(seek_ts, 0.0)
            }).ok();
        }
    }
    
    // 채널을 통한 오디오 데이터 전달 (bounded channel로 버퍼 크기 제한)
    // 버퍼 크기를 적절히 설정 (약 0.5초 분량 - 로컬 파일이므로 작게)
    let buffer_size = (target_sample_rate / 2) as usize; // 약 0.5초 분량
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
    
    // 여러 패킷을 배치로 처리하여 효율성 향상
    thread::spawn(move || {
        let mut batch_samples = Vec::new();
        const BATCH_SIZE: usize = 4; // 한 번에 처리할 패킷 수
        
        // 고품질 리샘플러 초기화 (FLAC 무손실 재생용) - 첫 패킷 후에 초기화
        let mut resampler: Option<SincFixedIn<f32>> = None;
        
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
                    Ok(packet) => packet,
                    Err(symphonia::core::errors::Error::ResetRequired) => {
                        decoder.reset();
                        break;
                    }
                    Err(_) => {
                        let mut state_guard = state_clone.lock().unwrap();
                        state_guard.is_playing = false;
                        // 배치에 이미 있는 데이터는 전송
                        if !batch_samples.is_empty() {
                            let _ = tx.send(batch_samples);
                        }
                        return;
                    }
                };
                
                if let Ok(decoded) = decoder.decode(&packet) {
                    let audio_buf = decoded;
                    let frames = audio_buf.frames();
                    let channels_count = audio_buf.spec().channels.count() as usize;
                    
                    // f32 버퍼로 변환
                    let duration = symphonia::core::units::Duration::from(frames as u64);
                    let mut f32_buf = symphonia::core::audio::AudioBuffer::<f32>::new(duration, *audio_buf.spec());
                    audio_buf.convert(&mut f32_buf);
                    
                    if needs_resampling {
                        // 리샘플러가 없으면 초기화 (첫 패킷에서)
                        if resampler.is_none() {
                            let params = SincInterpolationParameters {
                                sinc_len: 256, // 높은 품질을 위한 긴 sinc 필터
                                f_cutoff: 0.95,
                                interpolation: SincInterpolationType::Linear,
                                oversampling_factor: 256,
                                window: WindowFunction::BlackmanHarris2,
                            };
                            if let Ok(r) = SincFixedIn::<f32>::new(
                                resample_ratio,
                                2.0,
                                params,
                                frames.max(1024),
                                channels_count.max(2),
                            ) {
                                resampler = Some(r);
                            }
                        }
                        
                        // 고품질 리샘플링 (FLAC 무손실 재생용)
                        if let Some(ref mut resampler) = resampler {
                            // 채널별로 데이터 준비
                            let mut input_channels = Vec::new();
                            for ch in 0..channels_count.max(2) {
                                let channel_data: Vec<f32> = if channels_count > ch {
                                    f32_buf.chan(ch).iter().copied().collect()
                                } else {
                                    vec![0.0; frames]
                                };
                                input_channels.push(channel_data);
                            }
                            
                            // 리샘플링 수행
                            if let Ok(output_channels) = resampler.process(&input_channels, None) {
                                // 인터리브된 형식으로 변환 (L, R, L, R, ...)
                                let output_frames = output_channels[0].len();
                                let mut resampled = Vec::with_capacity(output_frames * 2);
                                for frame_idx in 0..output_frames {
                                    resampled.push(output_channels[0][frame_idx]);
                                    if channels_count > 1 {
                                        resampled.push(output_channels[1][frame_idx]);
                                    } else {
                                        resampled.push(output_channels[0][frame_idx]);
                                    }
                                }
                                batch_samples.extend(resampled);
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
                        }
                    } else {
                        // 리샘플링 불필요: 직접 복사
                        for frame_idx in 0..frames {
                            let sample = if channels_count > 0 {
                                f32_buf.chan(0)[frame_idx]
                            } else {
                                0.0
                            };
                            batch_samples.push(sample);
                            if channels_count > 1 {
                                batch_samples.push(f32_buf.chan(1)[frame_idx]);
                            } else {
                                batch_samples.push(sample);
                            }
                        }
                    }
                }
            }
            
            // 배치 전송
            if !batch_samples.is_empty() {
                if tx.send(batch_samples.clone()).is_err() {
                    break;
                }
            }
        }
    });
    
    // cpal 스트림 생성
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_stream::<f32>(&device, &config.into(), rx, state.clone())?,
        cpal::SampleFormat::I16 => build_stream::<i16>(&device, &config.into(), rx, state.clone())?,
        cpal::SampleFormat::I32 => build_stream::<i32>(&device, &config.into(), rx, state.clone())?,
        cpal::SampleFormat::I64 => build_stream::<i64>(&device, &config.into(), rx, state.clone())?,
        cpal::SampleFormat::U16 => build_stream::<u16>(&device, &config.into(), rx, state.clone())?,
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
    let mut sample_queue: VecDeque<f32> = VecDeque::with_capacity(sample_rate); // 약 0.5초 분량
    let mut last_samples = [0.0f32, 0.0f32]; // 마지막 샘플 저장 (끊김 방지)
    
    // 재생 시작 전에 버퍼를 미리 채우기 (프리로딩)
    // 최소 버퍼 크기: 약 0.1초 분량 (로컬 파일이므로 작게)
    let min_buffer_size = sample_rate / 5;
    let mut preload_attempts = 0;
    const MAX_PRELOAD_ATTEMPTS: usize = 50;
    
    while sample_queue.len() < min_buffer_size && preload_attempts < MAX_PRELOAD_ATTEMPTS {
        match rx.try_recv() {
            Ok(samples) => {
                sample_queue.extend(samples);
                preload_attempts = 0; // 성공하면 카운터 리셋
            }
            Err(mpsc::TryRecvError::Empty) => {
                preload_attempts += 1;
                thread::sleep(Duration::from_millis(5)); // 짧게 대기
            }
            Err(mpsc::TryRecvError::Disconnected) => {
                return Err("Channel disconnected during preload".to_string());
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
            // 블로킹 recv를 사용하되, 타임아웃을 두어 데드락 방지
            while sample_queue.len() < data.len() {
                match rx.try_recv() {
                    Ok(samples) => {
                        sample_queue.extend(samples);
                    }
                    Err(mpsc::TryRecvError::Empty) => {
                        // 버퍼가 비어있으면 마지막 샘플 반복 (끊김 방지)
                        // 또는 블로킹 recv 사용 (하지만 위험할 수 있음)
                        // 일단 마지막 샘플 반복으로 처리
                        break;
                    }
                    Err(mpsc::TryRecvError::Disconnected) => {
                        // 채널이 닫혔으면 재생 종료
                        for sample in data.iter_mut() {
                            *sample = T::from_sample(0.0);
                        }
                        return;
                    }
                }
            }
            
            // 데이터 출력
            let mut output_idx = 0;
            while output_idx < data.len() && !sample_queue.is_empty() {
                let sample = sample_queue.pop_front().unwrap() * volume;
                data[output_idx] = T::from_sample(sample);
                
                // 마지막 샘플 저장 (끊김 방지용)
                if output_idx % 2 == 0 {
                    last_samples[0] = sample;
                } else {
                    last_samples[1] = sample;
                }
                
                output_idx += 1;
            }
            
            // 남은 공간 처리 (버퍼가 부족한 경우)
            // 마지막 샘플을 반복하여 끊김을 최소화
            while output_idx < data.len() {
                let sample = if output_idx % 2 == 0 {
                    last_samples[0] * volume
                } else {
                    last_samples[1] * volume
                };
                data[output_idx] = T::from_sample(sample);
                output_idx += 1;
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
    }
    
    Ok(())
}

#[tauri::command]
pub async fn seek_audio(time: f64) -> Result<(), String> {
    let file_path_and_volume = {
        let state_guard = PLAYER_STATE.lock().unwrap();
        if let Some(state) = state_guard.as_ref() {
            let player_state = state.lock().unwrap();
            if let Some(file_path) = &player_state.current_file {
                Some((file_path.clone(), player_state.volume))
            } else {
                None
            }
        } else {
            None
        }
    };
    
    if let Some((file_path, volume)) = file_path_and_volume {
        play_audio(file_path, volume, Some(time)).await?;
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
    Ok(())
}
