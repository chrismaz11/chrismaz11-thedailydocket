import { Devvit } from '@devvit/public-api';

interface GlassCardProps {
  children: any;
  animate?: boolean;
  color?: string;
  key?: string;
}

export function GlassCard({ children, animate = false, color = "#FFFFFF" }: GlassCardProps) {
  return (
    <vstack
      padding="large"
      backgroundColor="rgba(255,255,255,0.05)"
      border="thin"
      borderColor="rgba(255,255,255,0.1)"
      cornerRadius="large"
      gap="medium"
    >
      {children}
    </vstack>
  );
}
