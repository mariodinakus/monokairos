/* Web Worker: trains the MONO-ML zoo off the main thread. */
importScripts('model.js');
onmessage = e => {
  const { id, temp, wind, precip, cloud } = e.data;
  try {
    const M = self.MONOModel;
    postMessage({ id, ok: true, temp: M.fitVariable(temp), wind: M.fitVariable(wind, { nonNegative: true }), precip: M.fitRain(precip), cloud: cloud ? M.fitVariable(cloud) : { leads: {} } });
  } catch (err) { postMessage({ id, ok: false, error: String(err) }); }
};
