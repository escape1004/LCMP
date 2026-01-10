use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use std::sync::Mutex;

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
