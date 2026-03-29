import { Devvit } from '@devvit/public-api';

interface StreakFlameProps {
  intensity: number;
  showNumber?: boolean;
}

export function StreakFlame({ intensity, showNumber = false }: StreakFlameProps) {
  const getFlameEmoji = () => {
    if (intensity >= 30) return '🔥🔥🔥';
    if (intensity >= 14) return '🔥🔥';
    if (intensity >= 7) return '🔥';
    return '⚡';
  };
  
  const getColor = () => {
    if (intensity >= 30) return '#FF0000';
    if (intensity >= 14) return '#FF6B35';
    if (intensity >= 7) return '#FFD700';
    return '#00CED1';
  };
  
  return (
    <hstack gap="small" alignment="center" backgroundColor="rgba(255,107,53,0.1)" padding="small" cornerRadius="full">
      <text size={showNumber ? "xlarge" : "large"}>{getFlameEmoji()}</text>
      {showNumber && (
        <text weight="bold" color={getColor()}>{intensity}</text>
      )}
    </hstack>
  );
}
