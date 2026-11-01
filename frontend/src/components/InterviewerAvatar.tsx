interface InterviewerAvatarProps {
  className?: string
}

export default function InterviewerAvatar({ className = '' }: InterviewerAvatarProps) {
  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      role="img"
      aria-label="AI interviewer portrait"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="ia-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8f5ff" />
          <stop offset="55%" stopColor="#eee7ff" />
          <stop offset="100%" stopColor="#e2d8ff" />
        </linearGradient>
        <linearGradient id="ia-skin" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#f8d9c2" />
          <stop offset="100%" stopColor="#e8b18d" />
        </linearGradient>
        <linearGradient id="ia-skin-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eab99a" />
          <stop offset="100%" stopColor="#d99b78" />
        </linearGradient>
        <linearGradient id="ia-hair" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#453a66" />
          <stop offset="55%" stopColor="#2f274c" />
          <stop offset="100%" stopColor="#211a38" />
        </linearGradient>
        <linearGradient id="ia-blazer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4b4475" />
          <stop offset="100%" stopColor="#2b2648" />
        </linearGradient>
        <linearGradient id="ia-lapel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a5289" />
          <stop offset="100%" stopColor="#39325c" />
        </linearGradient>
        <linearGradient id="ia-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e9e5f7" />
        </linearGradient>
      </defs>

      <rect width="240" height="240" fill="url(#ia-bg)" />
      <circle cx="120" cy="102" r="86" fill="#ffffff" opacity="0.32" />
      <circle cx="120" cy="102" r="86" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="206" cy="38" r="48" fill="#7c5cfc" opacity="0.09" />
      <circle cx="30" cy="212" r="64" fill="#4f7cff" opacity="0.07" />

      <path d="M74 116 C68 50 94 28 120 28 C146 28 172 50 166 116 L162 158 L78 158 Z" fill="url(#ia-hair)" />
      <path d="M104 126 L136 126 L141 170 C132 179 108 179 99 170 Z" fill="url(#ia-skin-shade)" />
      <path d="M104 130 C110 140 130 140 136 130 L136 126 L104 126 Z" fill="#c98a68" opacity="0.45" />

      <path d="M38 240 C42 196 66 174 104 164 L120 180 L136 164 C174 174 198 196 202 240 Z" fill="url(#ia-blazer)" />
      <path d="M104 164 L120 180 L136 164 L146 240 L94 240 Z" fill="url(#ia-shirt)" />
      <path d="M104 164 L120 180 L108 240 L72 240 C76 208 88 182 104 164 Z" fill="url(#ia-lapel)" />
      <path d="M136 164 L120 180 L132 240 L168 240 C164 208 152 182 136 164 Z" fill="url(#ia-lapel)" />
      <path d="M104 164 L120 180 L136 164 L142 172 L120 190 L98 172 Z" fill="url(#ia-shirt)" />
      <path d="M104 164 L120 180 L110 190 L100 174 Z" fill="#ffffff" opacity="0.38" />
      <path d="M136 164 L120 180 L130 190 L140 174 Z" fill="#ffffff" opacity="0.22" />
      <circle cx="100" cy="202" r="2.6" fill="#d7b56d" />
      <circle cx="100" cy="202" r="1" fill="#f4dfa6" />

      <ellipse cx="82" cy="100" rx="7" ry="11" fill="url(#ia-skin)" />
      <ellipse cx="158" cy="100" rx="7" ry="11" fill="url(#ia-skin)" />
      <path d="M80 98 C82 102 82 106 81 109" stroke="#d19a78" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M160 98 C158 102 158 106 159 109" stroke="#d19a78" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      <ellipse cx="120" cy="96" rx="39" ry="47" fill="url(#ia-skin)" />
      <ellipse cx="100" cy="111" rx="7" ry="4" fill="#e88a7a" opacity="0.16" />
      <ellipse cx="140" cy="111" rx="7" ry="4" fill="#e88a7a" opacity="0.16" />

      <path d="M84 94 C84 58 100 44 120 44 C140 44 156 58 156 88 C148 68 136 60 120 60 C104 60 92 70 84 94 Z" fill="url(#ia-hair)" />
      <path d="M86 92 C92 60 108 48 128 50 C116 56 108 66 104 78 C98 88 92 94 86 92 Z" fill="#514572" opacity="0.85" />
      <path d="M154 86 C158 98 160 116 158 132 C156 116 152 100 148 88 Z" fill="#2a2243" opacity="0.55" />

      <path d="M99 88 Q107 84 114 88" stroke="#3a2f45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M126 88 Q133 84 141 88" stroke="#3a2f45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="106" cy="96" rx="3.2" ry="3.9" fill="#2a2238" />
      <ellipse cx="134" cy="96" rx="3.2" ry="3.9" fill="#2a2238" />
      <circle cx="107.2" cy="94.8" r="0.9" fill="#ffffff" opacity="0.9" />
      <circle cx="135.2" cy="94.8" r="0.9" fill="#ffffff" opacity="0.9" />
      <path d="M120 98 C118 105 118 109 122 111" stroke="#c98f70" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M108 120 Q120 128 132 120" stroke="#a95f5f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M112 122 Q120 126 128 122" stroke="#c97878" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.7" />

      <circle cx="82" cy="112" r="2.2" fill="#d7b56d" />
      <circle cx="158" cy="112" r="2.2" fill="#d7b56d" />
    </svg>
  )
}
