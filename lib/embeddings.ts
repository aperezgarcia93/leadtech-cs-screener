import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  pipelinePromise ??= pipeline("feature-extraction", MODEL_ID);
  return pipelinePromise;
}

class LocalMiniLmEmbedder implements Embedder {
  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await getPipeline();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const [count, dim] = output.dims;
    const data = output.data as Float32Array;
    return Array.from({ length: count }, (_, i) =>
      Array.from(data.slice(i * dim, (i + 1) * dim)),
    );
  }
}

let embedder: Embedder | null = null;

/** Singleton: the ~25 MB model is loaded once per process. */
export function getLocalEmbedder(): Embedder {
  embedder ??= new LocalMiniLmEmbedder();
  return embedder;
}
