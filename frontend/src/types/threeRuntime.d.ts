/* Minimal local surface used by the lazily loaded Three.js renderer.
 * The installed runtime package does not ship declarations in this tree. */
declare module 'three' {
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    copy(other: Vector3): this;
    add(other: Vector3): this;
    normalize(): this;
    multiplyScalar(value: number): this;
  }
  export class Object3D {
    position: Vector3;
    add(object: unknown): void;
    traverse(callback: (object: Object3D) => void): void;
    clear(): void;
  }
  export class Scene extends Object3D {}
  export class Group extends Object3D {}
  export class Sphere {
    center: Vector3;
    radius: number;
  }
  export class Box3 {
    setFromObject(object: Object3D): this;
    getBoundingSphere(target: Sphere): Sphere;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    fov: number;
    near: number;
    far: number;
    position: Vector3;
    updateProjectionMatrix(): void;
  }
  export class WebGLRenderer {
    constructor(options?: {
      antialias?: boolean;
      alpha?: boolean;
      preserveDrawingBuffer?: boolean;
    });
    domElement: HTMLCanvasElement;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
    forceContextLoss(): void;
  }
  export class HemisphereLight {
    constructor(skyColor?: number, groundColor?: number, intensity?: number);
  }
  export class DirectionalLight {
    constructor(color?: number, intensity?: number);
    position: { set(x: number, y: number, z: number): void };
  }
  export class GridHelper extends LineSegments {
    constructor(size?: number, divisions?: number, color1?: number, color2?: number);
  }
  export class Material {
    dispose(): void;
  }
  export class BufferGeometry {
    dispose(): void;
  }
  export class MeshStandardMaterial extends Material {
    constructor(options?: {
      color?: number;
      roughness?: number;
      metalness?: number;
      transparent?: boolean;
      opacity?: number;
    });
    clone(): MeshStandardMaterial;
  }
  export class LineSegments extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
  }
  export class Mesh extends Object3D {
    constructor(geometry: BufferGeometry, material: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }
  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(
      radiusTop?: number,
      radiusBottom?: number,
      height?: number,
      radialSegments?: number,
    );
  }
  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number);
  }
  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }
}

declare module 'three/addons/controls/OrbitControls.js' {
  import type { PerspectiveCamera, Vector3 } from 'three';
  export class OrbitControls {
    constructor(camera: PerspectiveCamera, element: HTMLElement);
    enableDamping: boolean;
    target: Vector3;
    update(): void;
    addEventListener(type: 'change', listener: () => void): void;
    removeEventListener(type: 'change', listener: () => void): void;
    dispose(): void;
  }
}
