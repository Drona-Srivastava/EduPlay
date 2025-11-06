import torch, gc
gc.collect()
if torch.cuda.is_available():
    torch.cuda.empty_cache()
    torch.cuda.synchronize()
    print("✅ GPU cleared before loading new video.")
else:
    print("⚠️ No CUDA device found.")