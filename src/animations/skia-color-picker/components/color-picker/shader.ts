import { Skia } from '@shopify/react-native-skia';

// Initiate the Skia runtime effect with a shader program.
const radialGradientShader = Skia.RuntimeEffect.Make(`
  // Constants for Pi and 2*Pi. These are used for trigonometric calculations.
  const float PI = 3.1415926535897932384626433832795;
  const float TAU = 2.0 * PI;

  // Define the center of the gradient as the middle of our canvas.
  // Also, define the radius of our gradient.
  const vec2 center = vec2(0.5, 0.5);
  const float radius = 0.5;

  // A uniform variable size that can be set from outside the shader.
  uniform float size;

  // A quadratic easing function for smooth color transitions.
  float quadraticIn(float t) {
    return t * t;
  }

  // Function to convert HSV (Hue, Saturation, Value) color space to RGB.
  vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // The main function which will be run for every pixel on the canvas.
  vec4 main(vec2 pos) {
    // Normalize the x,y values of the pixel's position to range between 0 and 1.
    vec2 normalized = pos / vec2(size);

    // Calculate the Euclidean distance from the current pixel's position to the center of the gradient.
    float distance = length(normalized - center);

    // If the distance of the pixel from the center is greater than the radius, make it transparent.
    if (distance > radius) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    }

    // Calculate the hue based on the angle formed by the pixel's position, 
    // the center, and the x-axis. This will give a nice transition of colors 
    // in a circular fashion around the center.
    vec2 normalizedCentered = normalized - 0.5;
    float a = atan(normalizedCentered.y, normalizedCentered.x);
    float hue = a * 0.5 / PI + 0.5;

    // The farther the pixel is from the center, the more saturated the color.
    float saturation = quadraticIn(distance * 2);

    // The brightness value is kept constant at 1.0 for this shader.
    float value = 1.0;
    
    // Convert the HSV values to RGB.
    vec3 hsv = vec3(hue, saturation, value);

    // Return the resulting color with full opacity.
    return vec4(hsv2rgb(hsv), 1.0);
  }
`)!;

export { radialGradientShader };
