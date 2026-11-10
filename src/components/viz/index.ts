// generic figures, available in every mdx file without an import.
// chapter-specific figures go in src/components/figures/<part>/ and get imported.

import { ArrayViz } from "./ArrayViz";
import { Bars } from "./Bars";
import { Flow } from "./Flow";
import { Slide, Slides } from "./Slides";
import { Tree } from "./Tree";

export const viz = { ArrayViz, Bars, Flow, Slides, Slide, Tree };

export { ArrayViz, Bars, Flow, Slides, Slide, Tree };
