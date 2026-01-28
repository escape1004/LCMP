import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Clock,
  Folder,
  Music4,
  Tag,
  User,
  Flame,
  AlertCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { invoke } from "@tauri-apps/api/tauri";
import { useDashboardStore } from "../stores/dashboardStore";

const StatCard = ({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper?: string;
  icon: React.ComponentType<{ className?: string }>;
}) => (
  <div className="rounded-lg border border-border bg-bg-sidebar p-4">
    <div className="flex items-center justify-between">
      <div className="space-y-1.5">
        <p className="text-sm text-text-muted">{title}</p>
        <p className="text-xl font-semibold text-text-primary leading-tight">{value}</p>
        {helper && <p className="text-xs text-text-muted">{helper}</p>}
      </div>
      <div className="h-10 w-10 rounded-lg bg-bg-primary border border-border flex items-center justify-center">
        <Icon className="w-5 h-5 text-text-muted" />
      </div>
    </div>
  </div>
);

const ListRow = ({ label, meta }: { label: string; meta: string }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-primary px-3 py-2">
    <span className="text-sm text-text-primary truncate min-w-0">{label}</span>
    <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">{meta}</span>
  </div>
);

const TagChip = ({ label, count }: { label: string; count: string }) => (
  <div className="flex items-center gap-2 rounded-full bg-bg-primary border border-border px-3 py-1 text-xs text-text-primary">
    <span className="truncate">{label}</span>
    <span className="text-text-muted">{count}</span>
  </div>
);

const EmptyOverlay = ({ className = "rounded-lg" }: { className?: string }) => (
  <div
    className={`absolute inset-0 ${className} backdrop-blur-sm flex items-center justify-center text-sm text-text-muted z-10 pointer-events-none`}
  >
    <div className="flex items-center gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 text-text-muted" />
      데이터 없음
    </div>
  </div>
);

type DashboardDateCount = { label: string; count: number };

type DashboardSongStat = {
  id: number;
  title: string | null;
  artist: string | null;
  file_path: string;
  play_count: number;
};

type DashboardRecentSong = {
  id: number;
  title: string | null;
  artist: string | null;
  created_at: string;
};

type DashboardNamedCount = {
  name: string;
  count: number;
};

type DashboardTagUsage = {
  name: string;
  song_count: number;
};

type DashboardPlaylistCount = {
  id: number;
  name: string;
  count: number;
};

type DashboardFolderCount = {
  id: number;
  name: string;
  count: number;
};

type DashboardStats = {
  total_song_count: number;
  total_duration_seconds: number;
  total_size_bytes: number;
  date_counts: DashboardDateCount[];
  top_songs: DashboardSongStat[];
  recent_songs: DashboardRecentSong[];
  top_artists: DashboardNamedCount[];
  top_tags: DashboardNamedCount[];
  top_playlists: DashboardPlaylistCount[];
  top_folders: DashboardFolderCount[];
  artist_most_played: DashboardNamedCount | null;
  artist_least_played: DashboardNamedCount | null;
  tag_most_played: DashboardNamedCount | null;
  tag_least_played: DashboardNamedCount | null;
  tag_most_used: DashboardNamedCount | null;
  tag_least_used: DashboardNamedCount | null;
  tag_usage: DashboardTagUsage[];
};

type DateUnit = "day" | "month" | "year";

const formatNumber = (value: number) => value.toLocaleString("ko-KR");

const formatDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}시간 ${mins}분`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatFileSize = (bytes: number) => {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${sizes[i]}`;
};

const formatCount = (count: number, suffix: string) => `${count.toLocaleString("ko-KR")}${suffix}`;

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { label?: string } }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    const value = payload[0].value ?? 0;
    const displayLabel = payload[0].payload?.label ?? label ?? "";
    return (
      <div
        style={{
          backgroundColor: "#2F3136",
          border: "1px solid #40444B",
          borderRadius: "4px",
          padding: "8px 12px",
          color: "#FFFFFF",
        }}
      >
        {displayLabel && (
          <div style={{ marginBottom: "4px", color: "#FFFFFF", fontWeight: 500 }}>
            {displayLabel}
          </div>
        )}
        <div style={{ color: "#FFFFFF" }}>개수: {formatNumber(value)}</div>
      </div>
    );
  }
  return null;
};

const getSongLabel = (song: { title: string | null; file_path: string }) => {
  if (song.title && song.title.trim()) return song.title;
  const name = song.file_path.split(/[/\\]/).pop();
  return name || "제목 없음";
};

export const DashboardView = () => {
  const { section } = useDashboardStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateUnit, setDateUnit] = useState<DateUnit>("month");
  const [isDateUnitOpen, setIsDateUnitOpen] = useState(false);
  const dateUnitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsLoading(true);
    invoke<DashboardStats>("get_dashboard_stats", { dateUnit })
      .then((data) => setStats(data))
      .catch((error) => {
        console.error("Failed to load dashboard stats:", error);
        setStats(null);
      })
      .finally(() => setIsLoading(false));
  }, [dateUnit]);

  useEffect(() => {
    if (!isDateUnitOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dateUnitRef.current && !dateUnitRef.current.contains(event.target as Node)) {
        setIsDateUnitOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDateUnitOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isDateUnitOpen]);

  const chartPoints = useMemo(() => stats?.date_counts ?? [], [stats]);
  const hasChartData = useMemo(
    () => chartPoints.some((point) => point.count > 0),
    [chartPoints]
  );

  const topSongs = stats?.top_songs ?? [];
  const recentSongs = stats?.recent_songs ?? [];
  const topArtists = stats?.top_artists ?? [];
  const topTags = stats?.top_tags ?? [];
  const topPlaylists = stats?.top_playlists ?? [];
  const topFolders = stats?.top_folders ?? [];
  const tagUsage = stats?.tag_usage ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
      <div className="flex-shrink-0 px-4 pt-4 pb-4 border-b border-border bg-bg-primary">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">대시보드</h2>
            <p className="text-sm text-text-muted mt-1">
              노래들의 데이터 요약과 재생 패턴을 한눈에 확인하세요.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-8">
        {section === "overall" && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard
                title="등록된 노래 개수"
                value={`${(stats?.total_song_count ?? 0).toLocaleString("ko-KR")} 곡`}
                icon={Music4}
              />
              <StatCard
                title="전체 노래 용량"
                value={formatFileSize(stats?.total_size_bytes ?? 0)}
                icon={Folder}
              />
              <StatCard
                title="전체 플레이타임"
                value={formatDuration(stats?.total_duration_seconds ?? 0)}
                icon={Clock}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
              <div className="xl:col-span-3 rounded-lg border border-border bg-bg-sidebar p-4 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary">날짜별 노래 재생수</h4>
                  </div>
                  <div ref={dateUnitRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsDateUnitOpen((prev) => !prev)}
                      className="h-9 px-3 rounded-md border border-border bg-bg-sidebar text-sm text-text-primary focus:outline-none cursor-pointer flex items-center gap-2 min-w-[120px]"
                    >
                      <span className="truncate">
                        {dateUnit === "day" ? "일별" : dateUnit === "month" ? "월별" : "연별"}
                      </span>
                      <ChevronDown className="w-3 h-3 ml-auto" />
                    </button>
                    {isDateUnitOpen && (
                      <div className="absolute right-0 mt-2 w-32 rounded-md border border-border bg-bg-sidebar shadow-lg z-20 overflow-hidden">
                        {([
                          { label: "일별", value: "day" },
                          { label: "월별", value: "month" },
                          { label: "연별", value: "year" },
                        ] as { label: string; value: DateUnit }[]).map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => {
                              setDateUnit(item.value);
                              setIsDateUnitOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              dateUnit === item.value
                                ? "bg-accent text-white"
                                : "text-text-primary hover:bg-hover"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 h-[300px] relative">
                  <div className="absolute inset-0 rounded-md bg-bg-sidebar border border-border" />
                  <div className="relative h-full">
                    {hasChartData && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartPoints} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="label" stroke="#9CA3AF" fontSize={12} padding={{ left: 0, right: 0 }} />
                          <YAxis stroke="#9CA3AF" fontSize={12} width={40} tickMargin={6} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="count" stroke="#5865F2" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {!hasChartData && <EmptyOverlay className="rounded-md" />}
                </div>
              </div>

              <div className="xl:col-span-2 rounded-lg border border-border bg-bg-sidebar p-4 space-y-3 relative min-h-[140px] overflow-hidden">
                <h4 className="text-sm font-semibold text-text-primary">최근 등록한 노래</h4>
                {recentSongs.length > 0 ? (
                  <div className="space-y-2">
                    {recentSongs.map((song) => (
                      <ListRow
                        key={song.id}
                        label={`${song.artist || "아티스트 없음"} / ${song.title || "제목 없음"}`}
                        meta={new Date(song.created_at).toLocaleDateString("ko-KR")}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyOverlay />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 space-y-3 relative min-h-[140px] overflow-hidden">
                <h4 className="text-sm font-semibold text-text-primary">자주 듣는 노래</h4>
                {topSongs.length > 0 ? (
                  <div className="space-y-2">
                    {topSongs.map((song) => (
                      <ListRow
                        key={song.id}
                        label={`${song.artist || "아티스트 없음"} / ${song.title || getSongLabel(song)}`}
                        meta={formatCount(song.play_count, "회")}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyOverlay />
                )}
              </div>
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 space-y-3 relative min-h-[140px] overflow-hidden">
                <h4 className="text-sm font-semibold text-text-primary">자주 듣는 플레이리스트</h4>
                {topPlaylists.length > 0 ? (
                  <div className="space-y-2">
                    {topPlaylists.map((playlist) => (
                      <ListRow
                        key={playlist.id}
                        label={playlist.name}
                        meta={formatCount(playlist.count, "회")}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyOverlay />
                )}
              </div>
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 space-y-3 relative min-h-[140px] overflow-hidden">
                <h4 className="text-sm font-semibold text-text-primary">자주 듣는 폴더</h4>
                {topFolders.length > 0 ? (
                  <div className="space-y-2">
                    {topFolders.map((folder) => (
                      <ListRow key={folder.id} label={folder.name} meta={formatCount(folder.count, "회")} />
                    ))}
                  </div>
                ) : (
                  <EmptyOverlay />
                )}
              </div>
            </div>
          </section>
        )}

        {section === "artist" && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <p className="text-sm text-text-muted">가장 많이 들은 아티스트</p>
                    <p className="text-xl font-semibold text-text-primary leading-tight">
                      {stats?.artist_most_played?.name ?? "-"}
                    </p>
                    {stats?.artist_most_played && (
                      <p className="text-xs text-text-muted">
                        {formatCount(stats.artist_most_played.count, "회 재생")}
                      </p>
                    )}
                  </div>
                </div>
                {!stats?.artist_most_played && <EmptyOverlay />}
              </div>
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <p className="text-sm text-text-muted">가장 적게 들은 아티스트</p>
                    <p className="text-xl font-semibold text-text-primary leading-tight">
                      {stats?.artist_least_played?.name ?? "-"}
                    </p>
                    {stats?.artist_least_played && (
                      <p className="text-xs text-text-muted">
                        {formatCount(stats.artist_least_played.count, "회 재생")}
                      </p>
                    )}
                  </div>
                </div>
                {!stats?.artist_least_played && <EmptyOverlay />}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg-sidebar p-4 space-y-3 relative min-h-[140px] overflow-hidden">
              <h4 className="text-sm font-semibold text-text-primary">자주 듣는 아티스트</h4>
              {topArtists.length > 0 ? (
                <div className="space-y-2">
                  {topArtists.map((artist) => (
                    <ListRow key={artist.name} label={artist.name} meta={formatCount(artist.count, "회")} />
                  ))}
                </div>
              ) : (
                <EmptyOverlay />
              )}
            </div>
          </section>
        )}

        {section === "tag" && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative min-h-[120px] overflow-hidden">
                <div className="space-y-1.5">
                  <p className="text-sm text-text-muted">많이 들은 태그</p>
                  <p className="text-xl font-semibold text-text-primary leading-tight">
                    {stats?.tag_most_played?.name ?? "-"}
                  </p>
                  {stats?.tag_most_played && (
                    <p className="text-xs text-text-muted">
                      {formatCount(stats.tag_most_played.count, "회 재생")}
                    </p>
                  )}
                </div>
                {!stats?.tag_most_played && <EmptyOverlay />}
              </div>
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative min-h-[120px] overflow-hidden">
                <div className="space-y-1.5">
                  <p className="text-sm text-text-muted">적게 들은 태그</p>
                  <p className="text-xl font-semibold text-text-primary leading-tight">
                    {stats?.tag_least_played?.name ?? "-"}
                  </p>
                  {stats?.tag_least_played && (
                    <p className="text-xs text-text-muted">
                      {formatCount(stats.tag_least_played.count, "회 재생")}
                    </p>
                  )}
                </div>
                {!stats?.tag_least_played && <EmptyOverlay />}
              </div>
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative min-h-[120px] overflow-hidden">
                <div className="space-y-1.5">
                  <p className="text-sm text-text-muted">가장 많은 태그</p>
                  <p className="text-xl font-semibold text-text-primary leading-tight">
                    {stats?.tag_most_used?.name ?? "-"}
                  </p>
                  {stats?.tag_most_used && (
                    <p className="text-xs text-text-muted">
                      {`${formatCount(stats.tag_most_used.count, "곡")} 등록됨`}
                    </p>
                  )}
                </div>
                {!stats?.tag_most_used && <EmptyOverlay />}
              </div>
              <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative min-h-[120px] overflow-hidden">
                <div className="space-y-1.5">
                  <p className="text-sm text-text-muted">가장 적은 태그</p>
                  <p className="text-xl font-semibold text-text-primary leading-tight">
                    {stats?.tag_least_used?.name ?? "-"}
                  </p>
                  {stats?.tag_least_used && (
                    <p className="text-xs text-text-muted">
                      {`${formatCount(stats.tag_least_used.count, "곡")} 등록됨`}
                    </p>
                  )}
                </div>
                {!stats?.tag_least_used && <EmptyOverlay />}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg-sidebar p-4 space-y-3 relative min-h-[140px] overflow-hidden">
              <h4 className="text-sm font-semibold text-text-primary">자주 듣는 태그</h4>
              {topTags.length > 0 ? (
                <div className="space-y-2">
                  {topTags.map((tag) => (
                    <ListRow key={tag.name} label={tag.name} meta={formatCount(tag.count, "회")} />
                  ))}
                </div>
              ) : (
                <EmptyOverlay />
              )}
            </div>

            <div className="rounded-lg border border-border bg-bg-sidebar p-4 relative min-h-[140px] overflow-hidden">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">현재 등록된 모든 태그</h4>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Tag className="w-4 h-4" />
                  {formatCount(tagUsage.length, "개")}
                </div>
              </div>
              {tagUsage.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {tagUsage.map((tag) => (
                    <TagChip key={tag.name} label={tag.name} count={`${tag.song_count}곡`} />
                  ))}
                </div>
              ) : (
                <EmptyOverlay />
              )}
            </div>
          </section>
        )}

        {isLoading && (
          <div className="text-xs text-text-muted text-center">통계를 불러오는 중...</div>
        )}
      </div>
    </div>
  );
};
