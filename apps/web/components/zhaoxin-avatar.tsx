interface ZhaoxinAvatarProps {
  size?: 'sm' | 'md' | 'lg'
  state?: 'idle' | 'searching' | 'citing' | 'limited'
  className?: string
}

export function ZhaoxinAvatar({ size = 'md', state = 'idle', className = '' }: ZhaoxinAvatarProps) {
  return (
    <span
      className={`zhaoxin-avatar zhaoxin-avatar-${size} ${className}`.trim()}
      data-state={state}
      role="img"
      aria-label="照心，典籍伴读小沙弥"
    >
      <img src="/zhaoxin-novice.png" alt="" width="128" height="128" />
    </span>
  )
}
