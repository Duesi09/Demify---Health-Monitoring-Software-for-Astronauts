import { Apple, Bone, Brain, Droplet, Dumbbell, Eye, Hand, HeartPulse, Wind, type LucideIcon } from "lucide-react";
import type { BodyRegionId, Status } from "@/lib/types";

/** Head-to-toe order used by lists and the default selection tie-break. */
export const REGION_ORDER: BodyRegionId[] = ["brain", "eyes", "heart", "lungs", "blood", "gut", "muscles", "skeleton", "skin"];

export const REGION_ICON: Record<BodyRegionId, LucideIcon> = {
  brain: Brain,
  eyes: Eye,
  heart: HeartPulse,
  lungs: Wind,
  blood: Droplet,
  gut: Apple,
  muscles: Dumbbell,
  skeleton: Bone,
  skin: Hand,
};

/** Where on the figure each region lives, for screen-reader labels and hints. */
export const REGION_LOCATION: Record<BodyRegionId, string> = {
  brain: "head",
  eyes: "face",
  heart: "left chest",
  lungs: "chest",
  blood: "forearm vessels",
  gut: "abdomen",
  muscles: "upper arms and thighs",
  skeleton: "pelvis, knees and shins",
  skin: "hands",
};

export const STATUS_VAR: Record<Status, string> = {
  nominal: "var(--nominal)",
  caution: "var(--caution)",
  critical: "var(--critical)",
  unknown: "var(--unknown)",
};

export const STATUS_RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };
