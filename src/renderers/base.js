import TextureBuffer from './textureBuffer';
import { BoundingSphere, Cartesian3, PerspectiveOffCenterFrustum, Intersect  } from 'cesium';
import { NUM_LIGHTS } from '../scene';
import { Vector3 } from 'three';

export const MAX_LIGHTS_PER_CLUSTER = 100;

export default class BaseRenderer {
  constructor(xSlices, ySlices, zSlices) {
    // Create a texture to store cluster data. Each cluster stores the number of lights followed by the light indices
    // ex: [5] [0, 3, 2, 10, 12, -1, -1, ....]
    this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MAX_LIGHTS_PER_CLUSTER + 1);
    this._xSlices = xSlices;
    this._ySlices = ySlices;
    this._zSlices = zSlices;
  }

  updateClusters(camera, viewMatrix, scene) {
    // TODO: Update the cluster texture with the count and indices of the lights in each cluster
    // This will take some time. The math is nontrivial...

    for (let z = 0; z < this._zSlices; ++z) {
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          // Reset the light count to 0 for every cluster
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
        }
      }
    }

    let spheres = [];
    for (let i = 0; i < NUM_LIGHTS; ++i) { // there are NUM_LIGHTS in the scene
      let center = new Cartesian3(
        scene.lights[i].position[0], 
        scene.lights[i].position[1],
        scene.lights[i].position[2]);
      spheres.push(new BoundingSphere(center, scene.lights[i].radius));
    }

    let halfCameraFOV = (camera.fov / 2) * Math.PI / 180;

    let camearNearHalfHeight = Math.tan(halfCameraFOV) * camera.near;
    let camearNearHalfWidth = camera.aspect * camearNearHalfHeight;
    let cameraNearHeight = camearNearHalfHeight * 2;
    let cameraNearWidth = camearNearHalfWidth * 2;
    let cameraDir = new Vector3();
    camera.getWorldDirection(cameraDir);

    let xStart = -camearNearHalfWidth;
    let yStart = -camearNearHalfHeight;
    let zStart = camera.near;
    
    // uniform subdivision 
    let xStep = cameraNearWidth / this._xSlices;
    let yStep = cameraNearHeight / this._ySlices;
    let zStep = (camera.far - camera.near) / this._zSlices;

    for (let z = 0; z < this._zSlices; ++z) {
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {
          // https://cesium.com/learn/cesiumjs/ref-doc/PerspectiveOffCenterFrustum.html
          let subClusterFrustum = new PerspectiveOffCenterFrustum({
            left: xStart + x * xStep,
            right: xStart + (x + 1) * xStep,
            top: yStart + y * yStep,
            bottom: yStart + (y + 1) * yStep,
            near: zStart + z * zStep,
            far: zStart + (z + 1) * zStep
          });

          let cullingVolume = subClusterFrustum.computeCullingVolume(
            camera.position,
            cameraDir,
            camera.up);

          let count = 0;
          let indices = [];
          for (let k = 0; k < NUM_LIGHTS; ++k) {
            let intersect = cullingVolume.computeVisibility(spheres[k]); // note that sphere and culling volume are in world space
            if (intersect != Intersect.OUTSIDE) {
              count = count + 1;
              indices.push(k);
            }
          }

          // update cluster buffer
          // Create a texture to store cluster data. Each cluster stores the number of lights followed by the light indices
          // ex: [5] [0, 3, 2, 10, 12, -1, -1, ....]
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = count;
          for (let k = 1; k <= count; ++k) {
            let c = k % 4;
            let r = (k - c) / 4;
            this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, r) + c] = indices[k - 1]; 
          }
        }
      }
    }

    this._clusterTexture.update();
  }
}


// Maunlly building these is not good
/*
updateClusters(camera, viewMatrix, scene) {
    // TODO: Update the cluster texture with the count and indices of the lights in each cluster
    // This will take some time. The math is nontrivial...

    // uniform subdivision 
    let clusterUnitDepth = (camera.far - camera.near) / this._zSlices;
    let halfCameraFOV = (camera.fov / 2) * Math.PI / 180;

    for (let z = 0; z < this._zSlices; ++z) {
      
      let clusterNearDepth = camera.near + z * clusterUnitDepth;
      let clusterFarDepth = clusterNearDepth + clusterUnitDepth;

      let clusterNearPlaneHalfHeight = Math.tan(halfCameraFOV) * clusterNearDepth;
      let clusterNearPlaneHalfWidth = camera.aspect * clusterNearPlaneHeight;
      
      let clusterFarPlaneHalfHeight = Math.tan(halfCameraFOV) * clusterFarDepth;
      let clusterFarPlaneHalfWidth = camera.aspect * clusterFarPlaneHeight;

      let clusterNearPlaneHeight = clusterNearPlaneHalfHeight * 2;
      let clusterNearPlaneWidth = clusterNearPlaneHalfWidth * 2;
      
      let clusterFarPlaneHeight = clusterFarPlaneHalfHeight * 2;
      let clusterFarPlaneWidth = clusterFarPlaneHalfWidth * 2;

      let nearPlaneStart = new Vector4(-clusterNearPlaneHalfWidth, clusterNearPlaneHalfHeight, -clusterNearDepth, 1);
      let farPlaneStart = new Vector4(-clusterFarPlaneHalfWidth, clusterFarPlaneHalfHeight, -clusterFarDepth, 1);

      // near
      let xStepNear = clusterNearPlaneWidth / this._xSlices;
      let yStepNear = clusterNearPlaneHeight / this._ySlices;

      // far
      let xStepFar = clusterFarPlaneWidth / this._xSlices;
      let yStepFar = clusterFarPlaneHeight / this._ySlices;

      for (let y = 0; y < this._ySlices; ++y) {
        // near
        let yNearOffsetTop = y * yStepNear;
        let yNearOffsetBottom = (y + 1)  * yStepNear;
        // far
        let yFarOffsetTop = y * yStepFar;
        let yFarOffsetBottom = (y + 1)  * yStepFar;

        for (let x = 0; x < this._xSlices; ++x) {

        // near
        let xNearOffsetLeft = x * xStepNear;
        let xNearOffsetRight = (x + 1)  * xStepNear;
        // far
        let xFarOffsetLeft = x * yStepFar;
        let xFarOffsetRight = (x + 1)  * xStepFar;

          // need to construct (sub-) frustums for clusters first

          // then construct sphere for point lights

          // then do frustum-sphere intersection, if intersect, add light to the cluster

          // need to know if a light is inside a cluster, thus need frustum-sphere intersection
          
          let nearPlane = new Plane();
          let farPlane;
          let leftPlane;
          let rightPlane;
          let topPlane;
          let bottomPlane;

          let subFrustum = new Frustum();

          // Reset the light count to 0 for every cluster
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
        }
      }
    }

    this._clusterTexture.update();
  }
  */