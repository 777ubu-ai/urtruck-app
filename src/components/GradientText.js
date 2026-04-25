import React from 'react';
import { Text, Platform } from 'react-native';

// Gradient text — на web через linear-gradient + background-clip
// На mobile — fallback на solid color
export default function GradientText({ children, style, colors = ['#F59E0B', '#EF4444'], ...props }) {
  if (Platform.OS === 'web') {
    return (
      <Text
        style={[
          style,
          {
            backgroundImage: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent',
          },
        ]}
        {...props}
      >
        {children}
      </Text>
    );
  }
  return <Text style={[style, { color: colors[0] }]} {...props}>{children}</Text>;
}
