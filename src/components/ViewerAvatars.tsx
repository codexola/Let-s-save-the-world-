type Viewer = { id: string; name: string; photoUrl?: string | null };

export function ViewerAvatars({
  viewers,
  max = 5,
}: {
  viewers: Array<{ viewer?: Viewer } | Viewer>;
  max?: number;
}) {
  const list = viewers
    .map((v) => ("viewer" in v && v.viewer ? v.viewer : (v as Viewer)))
    .filter(Boolean)
    .slice(0, Math.min(Math.max(max, 2), 5));

  if (list.length === 0) return null;

  return (
    <div className="viewer-avatars" aria-label="Recent viewers">
      {list.map((v, i) => (
        <img
          key={v.id}
          src={
            v.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(v.name)}&size=32&background=1ec8a5&color=04221b`
          }
          alt={v.name}
          title={v.name}
          className="viewer-avatar"
          style={{ zIndex: list.length - i }}
        />
      ))}
    </div>
  );
}
