use rodio::{Decoder, OutputStream, Sink, Source};
use std::fs::{File, create_dir_all};
use std::io::{BufReader, Write};
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use rayon::prelude::*;  // 병렬 처리
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::get_probe;

// 전역 오디오 재생 상태 (Sink만 저장, OutputStream은 함수 내부에서 유지)
static AUDIO_SINK: Mutex<Option<Arc<Sink>>> = Mutex::new(None);
// 현재 볼륨 상태 저장 (0.0 ~ 1.0)
static CURRENT_VOLUME: Mutex<f32> = Mutex::new(1.0);

#[tauri::command]
pub async fn play_audio(file_path: String, volume: Option<f32>) -> Result<(), String> {
    // 기존 재생 중지
    {
        let mut sink_guard = AUDIO_SINK.lock().unwrap();
        if let Some(ref sink) = *sink_guard {
            sink.stop();
        }
        *sink_guard = None;
    }
    
    // 새 파일 재생
    let file = File::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("Failed to decode audio: {}", e))?;
    
    let (_stream, stream_handle) = OutputStream::try_default()
        .map_err(|e| format!("Failed to create output stream: {}", e))?;
    
    let sink = Arc::new(Sink::try_new(&stream_handle)
        .map_err(|e| format!("Failed to create sink: {}", e))?);
    
    // 볼륨 설정 (제공된 볼륨 또는 저장된 볼륨 사용)
    let volume_to_set = if let Some(vol) = volume {
        let clamped = vol.max(0.0).min(1.0);
        {
            let mut vol_guard = CURRENT_VOLUME.lock().unwrap();
            *vol_guard = clamped;
        }
        clamped
    } else {
        let vol_guard = CURRENT_VOLUME.lock().unwrap();
        *vol_guard
    };
    sink.set_volume(volume_to_set);
    
    sink.append(source);
    sink.play();
    
    // Sink만 전역 상태에 저장 (OutputStream은 함수 내부에서 유지)
    {
        let mut sink_guard = AUDIO_SINK.lock().unwrap();
        *sink_guard = Some(sink);
    }
    
    // OutputStream을 drop하지 않도록 유지
    // 실제로는 Sink가 살아있는 동안 OutputStream도 유지되므로
    // 여기서 drop하지 않아도 됨
    std::mem::forget(_stream);
    
    Ok(())
}

#[tauri::command]
pub async fn pause_audio() -> Result<(), String> {
    let sink_guard = AUDIO_SINK.lock().unwrap();
    if let Some(ref sink) = *sink_guard {
        sink.pause();
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_audio() -> Result<(), String> {
    let sink_guard = AUDIO_SINK.lock().unwrap();
    if let Some(ref sink) = *sink_guard {
        sink.play();
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_audio() -> Result<(), String> {
    let mut sink_guard = AUDIO_SINK.lock().unwrap();
    if let Some(ref sink) = *sink_guard {
        sink.stop();
    }
    *sink_guard = None;
    Ok(())
}

#[tauri::command]
pub async fn set_volume(volume: f32) -> Result<(), String> {
    let clamped_volume = volume.max(0.0).min(1.0);
    
    // 볼륨 상태 저장
    {
        let mut vol_guard = CURRENT_VOLUME.lock().unwrap();
        *vol_guard = clamped_volume;
    }
    
    // 현재 재생 중인 Sink에 볼륨 적용
    let sink_guard = AUDIO_SINK.lock().unwrap();
    if let Some(ref sink) = *sink_guard {
        sink.set_volume(clamped_volume);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_playback_position() -> Result<f64, String> {
    // rodio는 직접적인 위치 추적을 지원하지 않으므로
    // 대략적인 시간을 반환 (실제로는 더 복잡한 구현 필요)
    Ok(0.0)
}

// 웨이폼 캐시 디렉토리 경로 생성
fn get_waveform_cache_dir() -> Result<std::path::PathBuf, String> {
    let cache_dir = std::env::temp_dir().join("local-music-player").join("waveforms");
    create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    Ok(cache_dir)
}

// 파일 경로를 기반으로 캐시 파일명 생성
fn get_cache_filename(file_path: &str, num_samples: usize) -> String {
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    num_samples.hash(&mut hasher);
    format!("{:x}.wf", hasher.finish())
}

// 웨이폼 캐시에서 로드
fn load_waveform_cache(cache_path: &Path) -> Result<Vec<f32>, String> {
    let content = std::fs::read_to_string(cache_path)
        .map_err(|e| format!("Failed to read cache: {}", e))?;
    
    let waveform: Vec<f32> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cache: {}", e))?;
    
    Ok(waveform)
}

// 웨이폼을 캐시에 저장
fn save_waveform_cache(cache_path: &Path, waveform: &[f32]) -> Result<(), String> {
    let json = serde_json::to_string(waveform)
        .map_err(|e| format!("Failed to serialize waveform: {}", e))?;
    
    let mut file = File::create(cache_path)
        .map_err(|e| format!("Failed to create cache file: {}", e))?;
    
    file.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to write cache: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn extract_waveform(file_path: String, samples: Option<usize>) -> Result<Vec<f32>, String> {
    let num_samples = samples.unwrap_or(200); // 기본 200개 샘플
    
    // 캐시 디렉토리 확인
    if let Ok(cache_dir) = get_waveform_cache_dir() {
        let cache_filename = get_cache_filename(&file_path, num_samples);
        let cache_path = cache_dir.join(cache_filename);
        
        // 캐시가 있으면 로드
        if cache_path.exists() {
            // 원본 파일이 수정되었는지 확인
            let file_meta = std::fs::metadata(&file_path).ok();
            let cache_meta = std::fs::metadata(&cache_path).ok();
            
            if let (Some(file_meta), Some(cache_meta)) = (file_meta, cache_meta) {
                let file_modified = file_meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                let cache_modified = cache_meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                
                // 캐시가 원본보다 최신이면 사용
                if cache_modified >= file_modified {
                    if let Ok(waveform) = load_waveform_cache(&cache_path) {
                        // 웨이폼 유효성 검사 (빈 배열이 아니고, 길이가 맞는지 확인)
                        if !waveform.is_empty() && waveform.len() == num_samples {
                            // 모든 값이 0이 아닌지 확인 (잘못된 웨이폼 방지)
                            let has_non_zero = waveform.iter().any(|&v| v > 0.0);
                            if has_non_zero {
                                return Ok(waveform);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 캐시가 없거나 만료되었으면 추출 (rodio 사용 - 최적화 적용)
    let file = File::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    // 버퍼 크기 2MB로 설정 (I/O 성능 대폭 향상, 메모리 여유 활용)
    let buffer_size = 2 * 1024 * 1024; // 2MB
    let source = Decoder::new(BufReader::with_capacity(buffer_size, file))
        .map_err(|e| format!("Failed to decode audio: {}", e))?;
    
    let channels = source.channels() as usize;
    
    // 극도로 공격적인 다운샘플링: 100배 다운샘플링으로 속도 대폭 향상
    let downsample_factor = 100;
    
    // 예상 크기로 벡터 사전 할당 (재할당 방지로 성능 향상)
    // 대략적인 추정: 3분 노래 기준 약 8,000 샘플 (44.1kHz * 180초 / 100 / 2채널)
    let estimated_samples = 10000;
    let mut downsampled_samples = Vec::with_capacity(estimated_samples);
    let mut sample_count = 0u64;
    
    // 나눗셈 최적화: 매번 % 연산 대신 카운터로 관리
    let mut next_sample = 0u64;
    
    // 다운샘플링된 샘플 수집 (전체 파일 읽기 - rodio 제약)
    for sample in source {
        if sample_count == next_sample {
            // 정규화를 곱셈으로 최적화 (나눗셈보다 빠름)
            downsampled_samples.push((sample as f32) * 0.000030517578125); // 1.0 / 32768.0
            next_sample += downsample_factor as u64;
        }
        sample_count += 1;
    }
    
    if downsampled_samples.is_empty() {
        return Ok(vec![0.0; num_samples]);
    }
    
    let total_samples = downsampled_samples.len() / channels;
    
    // 각 웨이폼 바에 해당하는 샘플 구간 크기
    let samples_per_bar = (total_samples / num_samples.max(1)).max(1);
    
    // 병렬 처리로 RMS 계산 (모든 CPU 코어 활용)
    // Arc로 공유하여 여러 스레드에서 안전하게 접근
    let samples_arc = Arc::new(downsampled_samples);
    let channels_usize = channels;
    
    let mut waveform: Vec<f32> = (0..num_samples)
        .into_par_iter()  // 병렬 반복자
        .map(|i| {
            let start_sample = i * samples_per_bar;
            let end_sample = ((i + 1) * samples_per_bar).min(total_samples);
            
            if start_sample >= total_samples {
                return 0.0;
            }
            
            // 해당 구간의 RMS 계산 (전체 샘플 사용)
            let mut sum_squares = 0.0f32;
            let mut count = 0;
            
            // 각 채널에서 샘플 추출
            for sample_idx in start_sample..end_sample {
                for ch in 0..channels_usize {
                    let idx = sample_idx * channels_usize + ch;
                    if idx < samples_arc.len() {
                        let amplitude = samples_arc[idx];
                        sum_squares += amplitude * amplitude;
                        count += 1;
                    }
                }
            }
            
            // RMS 계산
            if count > 0 {
                (sum_squares / count as f32).sqrt()
            } else {
                0.0
            }
        })
        .collect();  // 병렬로 수집
    
    // 웨이폼 정규화 (0.0 ~ 1.0)
    let max = waveform.iter().copied().fold(0.0f32, f32::max);
    if max > 0.0 {
        for value in &mut waveform {
            *value /= max;
        }
    }
    
    // 캐시에 저장 (웨이폼 유효성 검사 후)
    // 웨이폼이 유효한 경우에만 저장 (모든 값이 0이 아닌 경우)
    let has_non_zero = waveform.iter().any(|&v| v > 0.0);
    if has_non_zero && waveform.len() == num_samples {
        if let Ok(cache_dir) = get_waveform_cache_dir() {
            let cache_filename = get_cache_filename(&file_path, num_samples);
            let cache_path = cache_dir.join(cache_filename);
            let _ = save_waveform_cache(&cache_path, &waveform);
        }
    }
    
    Ok(waveform)
}
