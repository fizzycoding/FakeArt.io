import React, { useState } from 'react';
import { X, Trophy, Percent, Gamepad2 } from 'lucide-react';
import { PlayerProfile } from '../types/game';

interface ProfileModalProps {
  profile: PlayerProfile;
  onSaveProfile: (updated: PlayerProfile) => void;
  onClose: () => void;
}

const EMOJI_AVATARS = ['🎨', '🦊', '🚀', '👑', '🤖', '👾', '🐱', '🦄', '🐼', '🍕'];

export default function ProfileModal({ profile, onSaveProfile, onClose }: ProfileModalProps) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);

  const winRate = profile.matchesPlayed > 0
    ? Math.round((profile.matchesWon / profile.matchesPlayed) * 100)
    : 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSaveProfile({
      ...profile,
      name: name.trim(),
      avatar
    });
    onClose();
  };

  const stats = [
    { icon: <Gamepad2 size={20} className="text-grape-dark" />, value: profile.matchesPlayed, label: 'Matches' },
    { icon: <Trophy size={20} className="text-sun" />, value: profile.matchesWon, label: 'Won' },
    { icon: <Percent size={20} className="text-bubble" />, value: `${winRate}%`, label: 'Win Rate' },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <div className="absolute -inset-[100%] -z-10 bg-ink/50 backdrop-blur-sm" />
      <div className="card p-6 max-w-md w-full flex flex-col gap-5 pop-in">
        <div className="flex justify-between items-center">
          <h2 className="font-display text-2xl font-bold">Your Profile</h2>
          <button onClick={onClose} aria-label="Close" className="btn btn-secondary btn-sm !p-2">
            <X size={18} />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="card-soft p-3 text-center flex flex-col items-center gap-0.5">
              {s.icon}
              <div className="font-display text-2xl font-bold">{s.value}</div>
              <div className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Edit Avatar */}
        <div>
          <label className="text-sm font-bold text-ink-soft block mb-2">Choose avatar</label>
          <div className="flex flex-wrap gap-2 justify-center">
            {EMOJI_AVATARS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setAvatar(emoji)}
                className={`text-2xl w-12 h-12 rounded-2xl border-2 transition-all cursor-pointer ${
                  avatar === emoji
                    ? 'border-ink bg-grape-soft scale-110 shadow-[0_3px_0_0_var(--color-ink)]'
                    : 'border-ink/15 bg-white hover:bg-grape-soft/60'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Edit Display Name */}
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-bold text-ink-soft block mb-1.5">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              maxLength={15}
            />
          </div>

          <button type="submit" className="btn btn-primary w-full py-3 text-lg">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}
