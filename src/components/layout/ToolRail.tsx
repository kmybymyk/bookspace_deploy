import { FolderTree, Type, Palette, Images, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { InspectorTool } from './inspectorTool'

interface ToolRailProps {
    activeTool: InspectorTool
    onChangeTool: (tool: InspectorTool) => void
}

const TOOLS: Array<{ id: InspectorTool; icon: typeof FolderTree }> = [
    { id: 'structure', icon: FolderTree },
    { id: 'content', icon: Type },
    { id: 'design', icon: Palette },
    { id: 'assets', icon: Images },
    { id: 'inspect', icon: ShieldCheck },
]

export default function ToolRail({ activeTool, onChangeTool }: ToolRailProps) {
    const { t } = useTranslation()

    return (
        <aside className="ds-panel ds-panel--left h-full w-14 min-w-14">
            <div className="flex h-full flex-col items-center gap-2 py-3">
                {TOOLS.map((tool) => {
                    const Icon = tool.icon
                    const selected = activeTool === tool.id
                    return (
                        <button
                            key={tool.id}
                            type="button"
                            onClick={() => onChangeTool(tool.id)}
                            title={t(`rightPane.tools.${tool.id}`)}
                            aria-label={t(`rightPane.tools.${tool.id}`)}
                            className="ds-icon-button h-9 w-9"
                            data-active={selected}
                        >
                            <Icon size={16} />
                        </button>
                    )
                })}
            </div>
        </aside>
    )
}
