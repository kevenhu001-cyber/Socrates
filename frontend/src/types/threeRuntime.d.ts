/* Minimal local surface used by the lazily loaded Three.js renderer.
 * The installed runtime package does not ship declarations in this tree. */
declare module 'three' {
  export class Scene {
    add(object: unknown): void;
    clear(): void;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    position: { set(x: number, y: number, z: number): void };
    updateProjectionMatrix(): void;
  }
  export class WebGLRenderer {
    constructor(options?: { antialias?: boolean; alpha?: boolean; preserveDrawingBuffer?: boolean });
    domElement: HTMLCanvasElement;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }
  export class HemisphereLight { constructor(skyColor?: number, groundColor?: number, intensity?: number); }
  export class DirectionalLight {
    constructor(color?: number, intensity?: number);
    position: { set(x: number, y: number, z: number): void };
  }
  export class GridHelper { constructor(size?: number, divisions?: number, color1?: number, color2?: number); }
  export class MeshStandardMaterial {
    constructor(options?: { color?: number; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number });
    clone(): MeshStandardMaterial;
  }
  export class Mesh {
    constructor(geometry: unknown, material: MeshStandardMaterial);
    position: { set(x: number, y: number, z: number): void };
  }
  export class SphereGeometry { constructor(radius?: number, widthSegments?: number, heightSegments?: number); }
  export class CylinderGeometry { constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number); }
  export class ConeGeometry { constructor(radius?: number, height?: number, radialSegments?: number); }
  export class BoxGeometry { constructor(width?: number, height?: number, depth?: number); }
}

declare module 'three/addons/controls/OrbitControls.js' {
  import type { PerspectiveCamera } from 'three';
  export class OrbitControls {
    constructor(camera: PerspectiveCamera, element: HTMLElement);
    enableDamping: boolean;
    target: { set(x: number, y: number, z: number): void };
    update(): void;
    dispose(): void;
  }
}
