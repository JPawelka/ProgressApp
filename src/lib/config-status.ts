import { GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { isPlanGenerationMockEnabled } from "@/lib/plans/plan-generation-config";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

const mockEnabled = isPlanGenerationMockEnabled();

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabel: "Zobacz instrukcję konfiguracji",
  },
  {
    name: "Gemini",
    configured: Boolean(GEMINI_API_KEY) || mockEnabled,
    message: mockEnabled
      ? "Gemini nie jest skonfigurowany — generowanie planów używa mock danych (tylko dev)."
      : "Gemini nie jest skonfigurowany — generowanie planów jest wyłączone.",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
