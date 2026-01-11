use std::fs::File;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::codecs::CODEC_TYPE_NULL;
use symphonia::default::get_probe;

#[tauri::command]
pub async fn get_audio_duration(file_path: String) -> Result<f64, String> {
    // symphonia를 사용하여 오디오 파일의 duration 가져오기
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

