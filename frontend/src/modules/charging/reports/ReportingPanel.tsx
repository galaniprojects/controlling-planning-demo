/**
 * Reporting integration surface for Cluster F per [F-RV-01].
 *
 * Until the Report Builder gains a native Cluster F data source (see open
 * note in [F-RV-04]), this panel acts as a discoverability bridge:
 *   - One-click jump to the AI Report Builder with a Cluster F prompt
 *     pre-filled in the URL hash (the builder reads `?prompt=` on load).
 *   - Catalogue card listing every dimension and measure the Cluster F
 *     data layer exposes (per the spec's data layer specification).
 *   - Quick-jump tiles to the existing reports that already touch
 *     charging data (Programme Rollup, Forecast Accuracy, YoY).
 */
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, BookOpen, Database, Sparkles } from 'lucide-react';

const CLUSTER_F_DIMENSIONS = [
  { key: 'entity', label: 'ChargeableEntity', desc: 'Single chargeable entity (PPM / S-code / ITF id)' },
  { key: 'entity_type', label: 'Entity type', desc: 'Project / Offering / Internal Service' },
  { key: 'hierarchy_node', label: 'Hierarchy node', desc: 'Cluster D portfolio hierarchy bucket' },
  { key: 'responsible', label: 'Responsible', desc: 'Person who owns the entity' },
  { key: 'change_or_run', label: 'Change / Run', desc: 'DoI 0–4 = Change · DoI 5 / Offerings / Services = Run' },
  { key: 'charging_location', label: 'Charging location', desc: '~90 KB charging codes' },
  { key: 'legal_entity', label: 'Legal entity', desc: '~120 registered KB companies' },
  { key: 'region', label: 'Region', desc: 'Geographic region attribute on charging location' },
  { key: 'division', label: 'Division', desc: 'Charging-location division (Corporate IT, T&B, Rail Vehicle …)' },
  { key: 'country', label: 'Country', desc: 'Charging-location country attribute' },
  { key: 'stage', label: 'Pipeline stage', desc: 'Working-name pipeline stage (Cluster A)' },
];

const CLUSTER_F_MEASURES = [
  { key: 'effective_cost', label: 'Effective cost', desc: 'Stage 1 own_cost + Σ inflows' },
  { key: 'own_cost', label: 'Own cost', desc: 'Entity\'s own annual budget / running cost' },
  { key: 'inflow_total', label: 'Inflow total', desc: 'Σ amount received from upstream entities' },
  { key: 'stage2_amount', label: 'Stage 2 amount (€)', desc: 'BTC-weighted location share' },
  { key: 'to_business_pct', label: 'To-Business %', desc: 'Share routed to business (vs. internal / self)' },
  { key: 'self_retained_pct', label: 'Self-retained %', desc: 'Derived: 100 − to_business − Σ edges' },
];

export function ReportingPanel() {
  const navigate = useNavigate();

  const goToBuilder = (prompt: string) => {
    // The AI Report Builder accepts a `prompt` URL param at /reporting/builder
    // and seeds the chat with it. If the param isn't yet wired, the page
    // falls back to a blank chat.
    navigate(`/reporting/builder?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="space-y-4">
      {/* Hero card — AI Report Builder bridge */}
      <Card className="p-5 border-primary/40">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-primary/10 p-3 text-primary shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              AI Report Builder · Cluster F
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              Ask the Report Builder a Cluster F question — it will reach into
              the dimensions and measures listed below and return a table or
              chart. Per [F-RV-01]: this is the unified entry point for ad-hoc
              charging analysis.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  goToBuilder(
                    'Show me total annual effective cost by charging location for 2026, broken down by division.',
                  )
                }
              >
                Cost by division
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  goToBuilder(
                    'Top 10 chargeable entities by inflow total in 2026 — surface the ones whose effective cost is dominated by upstream services.',
                  )
                }
              >
                Top inflow drivers
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  goToBuilder(
                    'Compare 2025 vs 2026 effective cost by region for all chargeable entities; highlight regions with > 10% growth.',
                  )
                }
              >
                Regional YoY
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate('/reporting/builder')}
              >
                Open builder
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Catalogue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Dimensions</h3>
            <Badge variant="outline" className="text-[10px]">
              {CLUSTER_F_DIMENSIONS.length}
            </Badge>
          </div>
          <ul className="space-y-2">
            {CLUSTER_F_DIMENSIONS.map((d) => (
              <li key={d.key} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{d.key}</span>
                  <span className="font-medium text-foreground">{d.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{d.desc}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Measures</h3>
            <Badge variant="outline" className="text-[10px]">
              {CLUSTER_F_MEASURES.length}
            </Badge>
          </div>
          <ul className="space-y-2">
            {CLUSTER_F_MEASURES.map((m) => (
              <li key={m.key} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{m.key}</span>
                  <span className="font-medium text-foreground">{m.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Existing report quick-jumps */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">Standard reports</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Existing reports that already surface charging-related data; useful
          while the Cluster F data layer is wired into the Report Builder.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate('/reporting?report=programme_rollup')}>
            Programme rollup
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/reporting?report=forecast_accuracy')}>
            Forecast accuracy
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/reporting?report=yoy')}>
            Year-over-year
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/reporting?report=cc_financial')}>
            Cost-center financial
          </Button>
        </div>
      </Card>
    </div>
  );
}
