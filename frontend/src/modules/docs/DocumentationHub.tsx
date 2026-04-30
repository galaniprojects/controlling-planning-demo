import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { OverviewTab } from './tabs/OverviewTab';
import { ModulesTab } from './tabs/ModulesTab';
import { ApiReferenceTab } from './tabs/ApiReferenceTab';
import { DataModelTab } from './tabs/DataModelTab';
import { FaqTab } from './tabs/FaqTab';

export function DocumentationHub() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader title="Documentation" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="modules">Module Guides</TabsTrigger>
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="data-model">Data Model</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab />
        </TabsContent>
        <TabsContent value="api">
          <ApiReferenceTab />
        </TabsContent>
        <TabsContent value="data-model">
          <DataModelTab />
        </TabsContent>
        <TabsContent value="faq">
          <FaqTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
