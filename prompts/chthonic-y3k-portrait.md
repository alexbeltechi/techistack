# Chthonic Y3K portrait

An image prompt for models that are good at image and video (made with Gemini). Square by default, a medium close-up, editorial.

To consistently recreate this specific visual aesthetic across different models or prompt interfaces, you need a master prompt template that locks in the environment, the material juxtapositions, and the specific high-fashion mood.

## The prompt

Copy this and replace `{SUBJECT}` and `{GARMENT}` for each new generation (examples below).

```text
{SUBJECT}, eyes closed in a calm, fashion-editorial expression, exuding quiet poise rather than ego.

{GARMENT}

Style & Materials: Eugene Tsui architectural fashion influence, blending chthonic and traditional tribal garment silhouettes with futuristic tech materials. Weaves, knits, and traditional patterns reimagined in translucent sci-fi fabrics, metallic sheen, and bright tech colors. Sleek, precise silhouettes avoiding excessive bulk.

Setting & Composition: Square aspect ratio, medium-close up portrait. Set against a hyper-clean, minimalist vanilla sky at dusk with a slight atmospheric mist. Absolutely no distracting background elements, no grass, no detailed nature—only the pure, empty gradient sky to emphasize the garment's silhouette.
```

## Fill in

- **`{SUBJECT}`**: who, and what features. For example:
  - A serene female model with Indigenous Arctic features
  - A male model with Northern European features and a blonde cropped mullet
- **`{GARMENT}`**: the headwear and the clothes, with their materials. For example:
  - Wearing a tight-fitting Y3K-sci-fi headpiece made of pink tech-mesh that strictly hugs the silhouette of the head, accented with thin, flat gold foil shapes and clamshell earrings. The body is dressed in a translucent, iridescent blue tech-fabric shawl layered over a minimalist white linen peasant blouse.
- **Aspect ratio**: square is the default and it's written into Setting & Composition. For another shape, change "Square aspect ratio" there, and set the same ratio in the tool if it has a setting for it.

## The core aesthetic formula

This style relies on the tension between ancient/indigenous silhouettes (chthonic, tribal) and hyper-modern, Y3K-sci-fi material execution (iridescent, tech-mesh), all grounded in a minimalist, serene environment.

## Tips: guidelines for consistent prompting and image referencing

These aren't part of the prompt. Use them when changing it or adding a reference image.

- **The "Material Swap" Technique:** When using a reference image of a traditional garment (like the sheep wool cloak or the Romanian blouse), explicitly state the material swap in your prompt. Say: "The exact silhouette and texture of traditional woven wool, but rendered entirely in semi-translucent, iridescent sci-fi smart-fabric."
- **Controlling the Background:** AI models naturally want to fill empty space. To maintain the clean look, always use negative prompts (if your tool supports them) or strict positive constraints: "studio-clean outdoor lighting," "pure empty sky background," "gradient dusk sky," and explicitly state "no grass, no mountains, no ground visible."
- **Facial Expressions & Mood:** The key to avoiding the "egotistical" high-fashion glare is specifying the internal state. Use keywords like "serene," "eyes loosely closed," "meditative," or "ethereal poise."
- **Diverse Physiognomy:** Be highly specific about the ethnic blend or specific regional features you want (e.g., "Mediterranean and Romani features," "Namibian facial structure") while maintaining the unified styling. This forces the model to treat the diverse cast as part of the same cohesive futuristic universe.
- **Using Reference Images:** When feeding an image prompt to an AI (like Midjourney or Claude), use the image weight parameters to dictate how strictly it follows the reference. If you want the shape of a traditional hat but the texture of alien tech, use the reference image primarily for composition, and let the text prompt do the heavy lifting for the materials.

  > Note: image weight is a Midjourney parameter (`--iw`). Gemini has no such setting, and Claude doesn't make images; there, say it in words instead, e.g. "use the reference only for the silhouette and composition".
