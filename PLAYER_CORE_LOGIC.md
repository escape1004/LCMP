# Player Core Logic

## EOF 에러 처리

```rust
Err(symphonia::core::errors::Error::IoError(ref io_err)) => {
    let error_msg = format!("{}", io_err);
    if error_msg.contains("end of stream") || error_msg.contains("UnexpectedEof") {
        consecutive_eof_errors += 1;
        let played_seconds = current_packet_time;
        let is_progressing = total_samples_sent > last_samples_sent;
        
        if is_progressing {
            consecutive_stuck_count = 0;
            last_eof_time = played_seconds;
        } else {
            if !playback_started {
                last_eof_time = played_seconds;
                break;
            }
            
            if last_eof_time > 0.0 && (last_eof_time - played_seconds).abs() < 0.1 {
                consecutive_stuck_count += 1;
            } else {
                consecutive_stuck_count = 0;
            }
            last_eof_time = played_seconds;
            
            let actual_played_seconds = {
                let state_guard = state_clone.lock().unwrap();
                if target_sample_rate_clone > 0 {
                    (state_guard.samples_played as f64 / 2.0) / target_sample_rate_clone as f64
                } else {
                    0.0
                }
            };
            
            let is_near_end = if let Some(total_duration) = expected_duration_clone {
                total_duration > 0.0 && actual_played_seconds >= (total_duration - 0.5).max(0.0)
            } else {
                false
            };
            
            if !is_progressing
                && consecutive_eof_errors > 10
                && playback_started
                && actual_played_seconds >= 5.0
                && (is_near_end || no_progress_count >= 100)
            {
                let mut state_guard = state_clone.lock().unwrap();
                state_guard.is_playing = false;
                if !batch_samples.is_empty() {
                    let _ = tx.send(batch_samples);
                }
                drop(tx);
                return;
            }
            
            decoder.reset();
            if consecutive_eof_errors <= 10 {
                thread::sleep(Duration::from_millis(10));
                break;
            } else if consecutive_eof_errors % 5 == 0 {
                // Seek 로직
            }
        }
    }
}
```

## Seek Backward

```rust
let mut seek_success = false;
let backward_offsets = vec![0.1, 0.2, 0.5];
for offset in backward_offsets {
    if played_seconds > offset {
        let seek_back_seconds = played_seconds - offset;
        let seek_seconds = seek_back_seconds as u64;
        let seek_frac = seek_back_seconds - seek_seconds as f64;
        
        match format_reader.seek(
            symphonia::core::formats::SeekMode::Coarse,
            symphonia::core::formats::SeekTo::Time {
                track_id: Some(track_id_clone),
                time: symphonia::core::units::Time::new(seek_seconds, seek_frac),
            }
        ) {
            Ok(_) => {
                decoder.reset();
                match format_reader.next_packet() {
                    Ok(packet) => {
                        let packet_ts = packet.ts();
                        let packet_time = if let Some(time_base) = codec_params_clone.time_base {
                            let time = time_base.calc_time(packet_ts);
                            time.seconds as f64 + time.frac as f64
                        } else {
                            seek_back_seconds
                        };
                        
                        current_packet_time = packet_time;
                        let expected_samples = (packet_time * target_sample_rate_clone as f64 * 2.0) as u64;
                        if expected_samples < total_samples_sent {
                            total_samples_sent = expected_samples;
                            last_samples_sent = expected_samples;
                            let mut state_guard = state_clone.lock().unwrap();
                            state_guard.samples_played = expected_samples;
                            drop(state_guard);
                        }
                        seek_success = true;
                        consecutive_eof_errors = consecutive_eof_errors.saturating_sub(5);
                        no_progress_count += 30;
                        consecutive_eof_errors += 10;
                        break;
                    }
                    Err(_) => {}
                }
            }
            Err(_) => {}
        }
    }
}
```

## Seek Forward

```rust
if !seek_success {
    let forward_offsets = vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.2, 0.5];
    for offset in forward_offsets {
        let seek_ahead_seconds = played_seconds + offset;
        let seek_seconds = seek_ahead_seconds as u64;
        let seek_frac = seek_ahead_seconds - seek_seconds as f64;
        
        match format_reader.seek(
            symphonia::core::formats::SeekMode::Coarse,
            symphonia::core::formats::SeekTo::Time {
                track_id: Some(track_id_clone),
                time: symphonia::core::units::Time::new(seek_seconds, seek_frac),
            }
        ) {
            Ok(_) => {
                decoder.reset();
                let seek_forward_time = played_seconds + offset;
                let expected_samples = (seek_forward_time * target_sample_rate_clone as f64 * 2.0) as u64;
                let mut state_guard = state_clone.lock().unwrap();
                state_guard.samples_played = expected_samples;
                drop(state_guard);
                seek_success = true;
                break;
            }
            Err(_) => {
                match format_reader.seek(
                    symphonia::core::formats::SeekMode::Accurate,
                    symphonia::core::formats::SeekTo::Time {
                        track_id: Some(track_id_clone),
                        time: symphonia::core::units::Time::new(seek_seconds, seek_frac),
                    }
                ) {
                    Ok(_) => {
                        decoder.reset();
                        let seek_forward_time = played_seconds + offset;
                        let expected_samples = (seek_forward_time * target_sample_rate_clone as f64 * 2.0) as u64;
                        let mut state_guard = state_clone.lock().unwrap();
                        state_guard.samples_played = expected_samples;
                        drop(state_guard);
                        seek_success = true;
                        break;
                    }
                    Err(_) => {}
                }
            }
        }
    }
}
```

## 초기화 Seek

```rust
let seek_time = state.lock().unwrap().seek_time.unwrap_or(0.0);
let seek_seconds = seek_time as u64;
let seek_frac = seek_time - seek_seconds as f64;

let seek_result = probed.format.seek(
    symphonia::core::formats::SeekMode::Accurate,
    symphonia::core::formats::SeekTo::Time {
        track_id: Some(track_id),
        time: symphonia::core::units::Time::new(seek_seconds, seek_frac),
    }
);

if seek_result.is_ok() {
    decoder.reset();
} else {
    let seek_result_0 = probed.format.seek(
        symphonia::core::formats::SeekMode::Coarse,
        symphonia::core::formats::SeekTo::Time {
            track_id: Some(track_id),
            time: symphonia::core::units::Time::new(0, 0.0),
        }
    );
    if seek_result_0.is_ok() {
        decoder.reset();
    }
}
```
