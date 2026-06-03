import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { configApi, type AppConfig } from '@/api/endpoints';
import { setRuntimeConfig, FALLBACK_CURRENT_PERIOD, FALLBACK_OPEN_FORECAST_MONTH } from '@/lib/yearColumns';

/**
 * Dynamic "present time" context. Fetches GET /api/config once on mount
 * and exposes the backend-driven current period / open forecast month /
 * fiscal year so consumers no longer hardcode the demo date.
 *
 * Modelled on RoleContext. Mounted in App.tsx as a sibling of RoleProvider.
 */
interface ConfigState {
  currentPeriod: string;
  openForecastMonth: string;
  fiscalYear: number;
  isLoading: boolean;
}

const ConfigCtx = createContext<ConfigState | null>(null);

// Until the fetch resolves we fall back to the shared yearColumns
// constants so first paint (and any synchronous helper call) has a sane
// value rather than undefined.
const FALLBACK_FISCAL_YEAR = parseInt(FALLBACK_CURRENT_PERIOD.slice(0, 4), 10);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>({
    current_period: FALLBACK_CURRENT_PERIOD,
    open_forecast_month: FALLBACK_OPEN_FORECAST_MONTH,
    fiscal_year: FALLBACK_FISCAL_YEAR,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    configApi
      .get()
      .then((cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        // Mirror into the module-level fallback so non-React helper
        // contexts (e.g. timeline window derivation) observe the real
        // current period rather than the pinned literal.
        setRuntimeConfig(cfg.current_period, cfg.open_forecast_month);
      })
      .catch((err) => {
        if (!cancelled) {
          // Degrade gracefully to the fallback period, but surface the failure.
          console.warn('[config] /api/config fetch failed; using fallback', err);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ConfigCtx.Provider
      value={{
        currentPeriod: config.current_period,
        openForecastMonth: config.open_forecast_month,
        fiscalYear: config.fiscal_year,
        isLoading,
      }}
    >
      {children}
    </ConfigCtx.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigCtx);
  if (!ctx) throw new Error('useConfig must be used inside ConfigProvider');
  return ctx;
}
