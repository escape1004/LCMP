import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { open } from "@tauri-apps/api/dialog";
import { exists } from "@tauri-apps/api/fs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Song } from "../types";
import { AlbumArtImage } from "./AlbumArtImage";
import { useModalBodyClass } from "../hooks/useModalBodyClass";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface MetadataModalProps {
  isOpen: boolean;
  song: Song | null;
  onClose: () => void;
  onSave?: (payload: {
    title: string;
    artist: string;
    album: string;
    year: number | null;
    genre: string;
    albumArtist: string;
    trackNumber: number | null;
    discNumber: number | null;
    comment: string;
    albumArtPath: string;
    composer: string;
    lyricist: string;
    bpm: number | null;
    key: string;
    copyright: string;
    encoder: string;
    isrc: string;
    publisher: string;
    subtitle: string;
    grouping: string;
  }) => void | Promise<void>;
}

export const MetadataModal = ({ isOpen, song, onClose, onSave }: MetadataModalProps) => {
  useModalBodyClass(isOpen);
  useEscapeToClose(isOpen, onClose);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [trackNumber, setTrackNumber] = useState("");
  const [discNumber, setDiscNumber] = useState("");
  const [comment, setComment] = useState("");
  const [albumArtPath, setAlbumArtPath] = useState("");
  const [composer, setComposer] = useState("");
  const [lyricist, setLyricist] = useState("");
  const [bpm, setBpm] = useState("");
  const [key, setKey] = useState("");
  const [copyright, setCopyright] = useState("");
  const [encoder, setEncoder] = useState("");
  const [isrc, setIsrc] = useState("");
  const [publisher, setPublisher] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [grouping, setGrouping] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!isOpen || !song) return;
    setTitle(song.title || "");
    setArtist(song.artist || "");
    setAlbum(song.album || "");
    setYear(song.year ? String(song.year) : "");
    setGenre(song.genre || "");
    setAlbumArtPath(song.album_art_path || "");
    setAlbumArtist("");
    setTrackNumber("");
    setDiscNumber("");
    setComment("");
    setComposer("");
    setLyricist("");
    setBpm("");
    setKey("");
    setCopyright("");
    setEncoder("");
    setIsrc("");
    setPublisher("");
    setSubtitle("");
    setGrouping("");
    setShowAdvanced(false);
  }, [isOpen, song]);

  const parseNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  };


  const handleSave = async () => {
    try {
      await onSave?.({
        title,
        artist,
        album,
        year: parseNumber(year),
        genre,
        albumArtist,
        trackNumber: parseNumber(trackNumber),
        discNumber: parseNumber(discNumber),
        comment,
        albumArtPath,
        composer,
        lyricist,
        bpm: parseNumber(bpm),
        key,
        copyright,
        encoder,
        isrc,
        publisher,
        subtitle,
        grouping,
      });
      onClose();
    } catch (error) {
      console.error("Failed to save metadata:", error);
    }
  };

  const getSongDirectory = () => {
    if (!song?.file_path) return undefined;
    return song.file_path.replace(/[/\\][^/\\]+$/, "");
  };

  const getAlbumArtDirectory = () => {
    if (!albumArtPath) return undefined;
    return albumArtPath.replace(/[/\\][^/\\]+$/, "");
  };

  const handleSelectCover = async () => {
    try {
      let defaultPath = getAlbumArtDirectory();
      if (defaultPath) {
        const isValid = await exists(defaultPath);
        if (!isValid) {
          defaultPath = undefined;
        }
      }
      if (!defaultPath) {
        defaultPath = getSongDirectory();
      }
      const selected = await open({
        multiple: false,
        defaultPath,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
        ],
        title: "커버 이미지 선택",
      });
      if (selected && typeof selected === "string") {
        setAlbumArtPath(selected);
      }
    } catch (error) {
      console.error("Failed to select cover image:", error);
    }
  };

  if (!isOpen || !song) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-primary rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">메타데이터 수정</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meta-cover" className="text-text-primary font-medium">
                  커버 이미지
                </Label>
                <button
                  type="button"
                  onClick={handleSelectCover}
                  className="w-40 h-40 flex items-center justify-center rounded-md border border-border bg-bg-sidebar hover:bg-hover transition-colors overflow-hidden"
                >
                  {albumArtPath ? (
                    <AlbumArtImage
                      filePath={song.file_path}
                      path={albumArtPath}
                      alt="Album Art"
                      className="w-full h-full object-cover"
                      fallback={<span className="text-text-muted text-sm">이미지 선택</span>}
                    />
                  ) : (
                    <span className="text-text-muted text-sm">이미지 선택</span>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="meta-title" className="text-text-primary font-medium">
                    제목
                  </Label>
                  <Input
                    id="meta-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="제목"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-artist" className="text-text-primary font-medium">
                    아티스트
                  </Label>
                  <Input
                    id="meta-artist"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="아티스트"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-album" className="text-text-primary font-medium">
                    앨범
                  </Label>
                  <Input
                    id="meta-album"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="앨범"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-album-artist" className="text-text-primary font-medium">
                    앨범 아티스트
                  </Label>
                  <Input
                    id="meta-album-artist"
                    value={albumArtist}
                    onChange={(e) => setAlbumArtist(e.target.value)}
                    placeholder="앨범 아티스트"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-year" className="text-text-primary font-medium">
                    연도
                  </Label>
                  <Input
                    id="meta-year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="예: 2024"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-genre" className="text-text-primary font-medium">
                    장르
                  </Label>
                  <Input
                    id="meta-genre"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="장르"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-track" className="text-text-primary font-medium">
                    트랙 번호
                  </Label>
                  <Input
                    id="meta-track"
                    type="number"
                    value={trackNumber}
                    onChange={(e) => setTrackNumber(e.target.value)}
                    placeholder="예: 1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta-disc" className="text-text-primary font-medium">
                    디스크 번호
                  </Label>
                  <Input
                    id="meta-disc"
                    type="number"
                    value={discNumber}
                    onChange={(e) => setDiscNumber(e.target.value)}
                    placeholder="예: 1"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="meta-comment" className="text-text-primary font-medium">
                    코멘트
                  </Label>
                  <Input
                    id="meta-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="코멘트"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="text-sm text-text-muted hover:text-text-primary transition-colors flex items-center gap-2"
            >
              고급 설정
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAdvanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="meta-composer" className="text-text-primary font-medium">
                      작곡가
                    </Label>
                    <Input
                      id="meta-composer"
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      placeholder="작곡가"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-lyricist" className="text-text-primary font-medium">
                      작사가
                    </Label>
                    <Input
                      id="meta-lyricist"
                      value={lyricist}
                      onChange={(e) => setLyricist(e.target.value)}
                      placeholder="작사가"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-bpm" className="text-text-primary font-medium">
                      BPM
                    </Label>
                    <Input
                      id="meta-bpm"
                      type="number"
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value)}
                      placeholder="120"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-key" className="text-text-primary font-medium">
                      키
                    </Label>
                    <Input
                      id="meta-key"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="예: C#m"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-copyright" className="text-text-primary font-medium">
                      저작권
                    </Label>
                    <Input
                      id="meta-copyright"
                      value={copyright}
                      onChange={(e) => setCopyright(e.target.value)}
                      placeholder="저작권"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-encoder" className="text-text-primary font-medium">
                      인코더
                    </Label>
                    <Input
                      id="meta-encoder"
                      value={encoder}
                      onChange={(e) => setEncoder(e.target.value)}
                      placeholder="인코더"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-isrc" className="text-text-primary font-medium">
                      ISRC
                    </Label>
                    <Input
                      id="meta-isrc"
                      value={isrc}
                      onChange={(e) => setIsrc(e.target.value)}
                      placeholder="ISRC"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-publisher" className="text-text-primary font-medium">
                      발매사
                    </Label>
                    <Input
                      id="meta-publisher"
                      value={publisher}
                      onChange={(e) => setPublisher(e.target.value)}
                      placeholder="발매사"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-subtitle" className="text-text-primary font-medium">
                      부제
                    </Label>
                    <Input
                      id="meta-subtitle"
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="부제"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meta-grouping" className="text-text-primary font-medium">
                      그룹
                    </Label>
                    <Input
                      id="meta-grouping"
                      value={grouping}
                      onChange={(e) => setGrouping(e.target.value)}
                      placeholder="그룹"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end justify-end gap-2 p-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-text-primary hover:bg-hover"
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            className="bg-accent hover:bg-accent/90"
          >
            저장
          </Button>
        </div>
      </div>
    </div>
  );
};




