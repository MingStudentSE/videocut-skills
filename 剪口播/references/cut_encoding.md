# 剪辑编码规则

`cut_video.sh` 的目标是帧级精确切割，并尽量匹配原片画质。

## 工作方式

1. 自动检测原片编码参数：`codec`、`profile`、`pix_fmt`、`bitrate`。
2. 使用 `filter_complex` 的 `trim + concat` 做帧级精确切割。
3. 按原片参数重编码，典型参数：

```text
-profile:v high -b:v {原片码率} -pix_fmt yuv420p
```

## 硬性原则

重编码画质取决于是否匹配原片参数，不只是 CRF。

- 推荐：`-b:v {原片码率} -profile:v high -pix_fmt yuv420p`
- 避免：只指定 `-crf N`，不指定 `profile/pix_fmt`

不要把 `cut_video.sh` 简化成粗糙的 `-ss/-to -c copy` 拼接；那会导致帧不准、音画不同步或画质/兼容性变化。
