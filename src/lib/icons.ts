// The icon of each task type and site, shared by the task cards, the week strip, the plant lists and
// the capture screen. Line icons from lucide-react (ISC); each is imported by name so only these ship.
import {
  Apple,
  Bug,
  Droplets,
  House,
  Layers,
  Scissors,
  ShieldCheck,
  Shovel,
  Sprout,
  Tractor,
  type LucideIcon,
} from "lucide-react";
import type { Site, TaskType } from "../types";

export const TASK_ICONS: Record<TaskType, LucideIcon> = {
  water: Droplets,
  prune: Scissors,
  feed: Shovel,
  mulch: Layers,
  harvest: Apple,
  scout: Bug,
  propagate: Sprout,
  protect: ShieldCheck,
};

export const SITE_ICONS: Record<Site, LucideIcon> = {
  farm: Tractor,
  backyard: House,
};
