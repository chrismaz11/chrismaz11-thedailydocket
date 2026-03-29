import { Devvit } from '@devvit/public-api';

interface GlowButtonProps {
  onPress?: () => void;
  selected: boolean;
  color: string;
  label: string;
  sublabel?: string;
  icon?: string;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  fullWidth?: boolean;
  pulse?: boolean;
  delay?: number;
  key?: string;
}

export function GlowButton({
  onPress,
  selected,
  color,
  label,
  sublabel,
  icon,
  size = 'medium',
  disabled = false,
  fullWidth = false,
}: GlowButtonProps) {
  const height = size === 'small' ? '32px' : size === 'large' ? '56px' : '48px';
  const textSize = size === 'small' ? 'small' : size === 'large' ? 'xlarge' : 'large';
  
  return (
    <hstack
      onPress={disabled ? undefined : onPress}
      height={height}
      grow={fullWidth}
      padding={size === 'small' ? 'small' : 'medium'}
      backgroundColor={selected ? color : 'rgba(255,255,255,0.05)'}
      border="thin"
      borderColor={selected ? color : 'rgba(255,255,255,0.2)'}
      cornerRadius="medium"
      gap="small"
      alignment="center middle"
    >
      {icon ? <text color={selected ? '#0F0F13' : color}>{icon}</text> : null}
      <vstack alignment={sublabel ? 'start middle' : 'center middle'}>
        <text size={textSize} weight="bold" color={selected ? '#0F0F13' : color}>
          {label}
        </text>
        {sublabel ? (
          <text size="small" color={selected ? 'rgba(15,15,19,0.7)' : '#8A8A8A'}>
            {sublabel}
          </text>
        ) : null}
      </vstack>
    </hstack>
  );
}
