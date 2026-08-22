import { Canvas, LinearGradient, Path, Shadow, vec } from '@shopify/react-native-skia';

/**
 * A dog-eared corner on the reading canvas — the underside of a page catching
 * the light, so the warm paper reads as a physical sheet, not a flat card. Pure
 * decoration, tucked into the bottom-right where the text padding leaves room.
 */
export function PageCurl({ size = 46 }: { size?: number }) {
  // Triangle: fold line from (0,size) up to (size,0), closed at the corner.
  const tri = `M0 ${size} L ${size} 0 L ${size} ${size} Z`;
  return (
    <Canvas
      style={{ position: 'absolute', right: 0, bottom: 0, width: size, height: size }}
      pointerEvents="none"
    >
      <Path path={tri}>
        {/* Lighter at the lifted corner, deepening toward the crease. */}
        <LinearGradient
          start={vec(size, size)}
          end={vec(0, size)}
          colors={['#efe7db', '#d9ccbb', '#c6b6a1']}
        />
        <Shadow dx={-1.5} dy={-1.5} blur={4} color="rgba(0,0,0,0.22)" />
      </Path>
    </Canvas>
  );
}
