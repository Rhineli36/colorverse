import sharp from "sharp";
import type { ShowcaseCloudEnvironment } from "../../worker/src/showcase-cloud";
export const serverImages: NonNullable<ShowcaseCloudEnvironment["IMAGES"]> = {
  input(stream) {
    return {
      transform(options) {
        return {
          async output(settings) {
            const reader = stream.getReader(),
              parts: Uint8Array[] = [];
            let length = 0;
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              length += value.length;
              if (length > 8388608) {
                await reader.cancel();
                throw new Error("IMAGE_TOO_LARGE");
              }
              parts.push(value);
            }
            if (
              options.fit !== "scale-down" ||
              settings.format !== "image/webp"
            )
              throw new Error("UNSUPPORTED_IMAGE_TRANSFORM");
            const bytes = await sharp(Buffer.concat(parts), {
              limitInputPixels: 16000000,
              animated: false,
              failOn: "warning",
            })
              .rotate()
              .resize({
                width: Number(options.width),
                height: Number(options.height),
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: Number(settings.quality) || 90 })
              .toBuffer();
            return {
              response: () =>
                new Response(bytes, {
                  headers: { "Content-Type": "image/webp" },
                }),
            };
          },
        };
      },
    };
  },
};
