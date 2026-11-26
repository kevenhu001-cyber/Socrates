

function solveSmallSystem(matrix, rhs, n) {
  for (let i = 0; i < n; i++) {
    let scale = 0;
    for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(matrix[i * n + j]));
    if (!(scale > 0) || !Number.isFinite(scale)) return false;
    for (let j = 0; j < n; j++) matrix[i * n + j] /= scale;
    rhs[i] /= scale;
  }
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(matrix[i * n + k]) > Math.abs(matrix[pivot * n + k])) pivot = i;
    if (!(Math.abs(matrix[pivot * n + k]) > 1e-12)) return false;
    if (pivot !== k) {
      for (let j = k; j < n; j++) {
        const value = matrix[k * n + j];
        matrix[k * n + j] = matrix[pivot * n + j];
        matrix[pivot * n + j] = value;
      }
      const value = rhs[k];
      rhs[k] = rhs[pivot];
      rhs[pivot] = value;
    }
    for (let i = k + 1; i < n; i++) {
      const factor = matrix[i * n + k] / matrix[k * n + k];
      for (let j = k + 1; j < n; j++) matrix[i * n + j] -= factor * matrix[k * n + j];
      rhs[i] -= factor * rhs[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) rhs[i] -= matrix[i * n + j] * rhs[j];
    rhs[i] /= matrix[i * n + i];
  }
  return rhs.every(Number.isFinite);
}

export { solveSmallSystem };
