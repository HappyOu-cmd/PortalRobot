import { UserRound } from 'lucide-react';

export function UserAvatar({ avatarDataUrl, displayName, className = '' }: {
  avatarDataUrl: string | null | undefined;
  displayName: string;
  className?: string;
}) {
  return <span className={`user-avatar-image ${className}`.trim()} aria-label={`Фотография профиля ${displayName}`}>
    {avatarDataUrl ? <img src={avatarDataUrl} alt="" /> : <UserRound aria-hidden="true" />}
  </span>;
}
