import {
  CloudPlanetAppearanceInput,
  type CloudPlanetDocumentSchema,
} from "@colorverse/contracts";
import type { z } from "zod";
export function planetAppearancePayload(
  document: z.infer<typeof CloudPlanetDocumentSchema>,
) {
  const {
    metadata,
    media: _media,
    revision: _revision,
    position: _position,
    visible: _visible,
    createdAt: _createdAt,
    ...appearance
  } = document;
  void _media;
  void _revision;
  void _position;
  void _visible;
  void _createdAt;
  return CloudPlanetAppearanceInput.parse({
    ...appearance,
    ...metadata,
    learningIntent: document.learningIntent ?? undefined,
  });
}
