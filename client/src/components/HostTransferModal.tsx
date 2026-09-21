import React from 'react';
import { Crown, Sparkles, UserCheck, X, AlertTriangle } from 'lucide-react';
import { Participant } from '../types/index.js';

interface HostTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  partyMembers: Participant[];
  currentUserId: string;
  onAutoTransferAndLeave: () => void;
  onManualTransferAndLeave: (targetParticipantId: string) => void;
  onPromptEndRoom: () => void;
}

export const HostTransferModal: React.FC<HostTransferModalProps> = ({
  isOpen,
  onClose,
  partyMembers,
  currentUserId,
  onAutoTransferAndLeave,
  onManualTransferAndLeave,
  onPromptEndRoom
}) => {
  if (!isOpen) return null;

  const eligibleMembers = partyMembers.filter((p) => p.participantId !== currentUserId);

  // Determine longest active party member for auto transfer preview
  const sortedByPartyTime = [...eligibleMembers].sort((a, b) => {
    const aTime = a.partyJoinedAt || a.joinedAt;
    const bTime = b.partyJoinedAt || b.joinedAt;
    return aTime - bTime;
  });
  const longestMember = sortedByPartyTime[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-surface-border shadow-2xl p-5 sm:p-6 modal-content-anim">
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-4">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white font-sans">Pass Host Controls</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="p-1 rounded-lg text-static-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-static-subtext mb-5">
          Pass host controls to keep the room open after you leave:
        </p>

        {/* Option 1: Auto Transfer */}
        <div className="mb-4">
          <button
            type="button"
            onClick={onAutoTransferAndLeave}
            className="w-full p-4 rounded-xl bg-static-accent/10 hover:bg-static-accent/20 border border-static-accent/30 text-left transition-colors cursor-pointer group flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-static-accent" />
                <span className="text-sm font-semibold text-white">Auto Transfer</span>
                <span className="text-[10px] font-mono uppercase bg-static-accent/20 text-static-accent px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-static-subtext">
                Pass to longest-running member:
                {longestMember ? (
                  <span className="text-static-accent font-semibold ml-1">
                    {longestMember.displayName}
                  </span>
                ) : (
                  ' next active member'
                )}
              </p>
            </div>
          </button>
        </div>

        {/* Option 2: Manual Selection */}
        {eligibleMembers.length > 0 && (
          <div className="mb-6">
            <span className="block text-xs uppercase font-mono tracking-wider text-static-muted mb-2">
              Or select new host:
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {eligibleMembers.map((member) => (
                <button
                  key={member.participantId}
                  type="button"
                  onClick={() => onManualTransferAndLeave(member.participantId)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-card hover:bg-surface-elevated border border-surface-border transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-surface-elevated flex items-center justify-center text-xs font-mono font-bold text-white">
                      {member.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-white truncate max-w-[180px]">
                      {member.displayName}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-static-accent flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Select</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Alternative: End Party for Everyone */}
        <div className="pt-4 border-t border-surface-border flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPromptEndRoom();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-static-danger/10 hover:bg-static-danger/20 border border-static-danger/30 text-static-danger text-xs font-mono font-semibold tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>End Room Instead</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs font-mono text-static-muted hover:text-white transition-colors cursor-pointer"
          >
            Stay in Party
          </button>
        </div>
      </div>
    </div>
  );
};
