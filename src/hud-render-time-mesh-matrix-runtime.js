// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers for resolving render-time window mesh matrices.
 * @param {object} [options={}] Render-time matrix runtime dependencies.
 * @param {() => boolean} [options.getVrRenderTimeMatricesCached] Resolver for whether render-time HUD matrices are cached for the current frame.
 * @param {() => { multiplyMatrices: (a: any, b: any) => any } | null | undefined} [options.getVrRenderTimeMeshMatrix] Resolver for the reusable output matrix instance.
 * @param {() => any} [options.getVrRenderTimeHudMatrix] Resolver for cached render-time HUD root matrix.
 * @returns {{ computeRenderTimeMeshMatrix: (mesh: { matrixWorld: any, updateMatrix?: () => void, matrix?: any }) => any }} API that resolves the matrix to use for render-time window picking math.
 * Side effects: mutates the reusable render-time output matrix when cached matrices are available.
 */
export function createHudRenderTimeMeshMatrixRuntime({
  getVrRenderTimeMatricesCached,
  getVrRenderTimeMeshMatrix,
  getVrRenderTimeHudMatrix,
} = {}) {
  function computeRenderTimeMeshMatrix(mesh) {
    if (!mesh) return null;
    if (!getVrRenderTimeMatricesCached?.()) {
      return mesh.matrixWorld;
    }

    mesh.updateMatrix?.();
    const renderTimeMeshMatrix = getVrRenderTimeMeshMatrix?.();
    const renderTimeHudMatrix = getVrRenderTimeHudMatrix?.();
    if (!renderTimeMeshMatrix || !renderTimeHudMatrix) {
      return mesh.matrixWorld;
    }

    renderTimeMeshMatrix.multiplyMatrices(renderTimeHudMatrix, mesh.matrix);
    return renderTimeMeshMatrix;
  }

  return {
    computeRenderTimeMeshMatrix,
  };
}
