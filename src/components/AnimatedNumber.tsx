import { Devvit } from '@devvit/public-api';

interface AnimatedNumberProps {
  value: number;
  duration?: number; // Kept for interface compatibility but unused
  color?: string;
  prefix?: string;
  suffix?: string;
}

export function AnimatedNumber({ value, color = "#F5F5F0", prefix = "", suffix = "" }: AnimatedNumberProps) {
  // Devvit Blocks don't support requestAnimationFrame or real-time UI counters in this way.
  // We render the final value directly.
  return (
    <text weight="bold" color={color}>
      {prefix}{value.toLocaleString()}{suffix}
    </text>
  );
}
