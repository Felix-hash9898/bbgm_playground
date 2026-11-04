"""Prepare a frozen-source one-worker benchmark (never runs it)."""
from pathlib import Path
import sys, json, gzip, hashlib, os
repo = Path(__file__).resolve().parents[2]
root = Path(sys.argv[1]).resolve()
if root == repo:
    raise SystemExit('Use an isolated source snapshot, never the active workspace')
browser = '--browser' in sys.argv
plugin = (root if (root/'.git').exists() else repo)/'tools/lib/rolldownPlugins/sportFunctions.ts'
source = (Path(__file__).parent/'bench.template.txt').read_text()
extra_imports = ''
extra_define = ''
if browser:
    fixture = Path(os.environ.get('BBGM_PERF_LEAGUE', '/Users/felixhuang/Downloads/BBGM_League_10_2019_regular_season_32-21.json.gz')).read_bytes()
    (root/'public').mkdir(exist_ok=True)
    (root/'public/perf-league.json').write_bytes(gzip.decompress(fixture))
    source = 'import { commands } from "vitest/browser";\n'+source[source.index('import { deleteDB }'):]
    # Instrument frozen source exports, avoiding browser ESM mock wrappers.
    (root/'src/test/perfMeasure.ts').write_text('''export const measure = (fn: any, name: string) => function(this: any, ...args: any[]) {
 const record = (globalThis as any).__bbgmPerfRecord;
 if (!record) return fn.apply(this,args);
 const start=performance.now();
 try { const result=fn.apply(this,args); if(result?.then) return result.finally(()=>record(name,performance.now()-start)); record(name,performance.now()-start); return result; }
 catch(error) {record(name,performance.now()-start);throw error;}
};''')
    for rel, name in [('worker/core/game/loadTeams.ts','preparation'),('worker/core/game/writePlayerStats.ts','writePlayerStats'),('worker/core/game/writeTeamStats.ts','writeTeamStats'),('worker/core/game/writeGameStats.ts','writeGameStats'),('worker/util/advStats.ts','advStats')]:
        target=root/'src'/rel
        backup=target.with_suffix('.perf-original')
        if not backup.exists(): backup.write_text(target.read_text())
        content=backup.read_text()
        import os,re
        imp=os.path.relpath(root/'src/test/perfMeasure.ts',target.parent)
        content='import { measure as __perfMeasure } from '+json.dumps(imp)+';\n'+content
        if name=='advStats' and 'export const advStats' in content:
            content=content.replace('export const advStats =','const advStatsRaw =').replace('registerGlobal({ advStats });','export const advStats = __perfMeasure(advStatsRaw,"advStats");\nregisterGlobal({ advStats });')
        else:
            content=re.sub(r'export default (\w+);',lambda m:'export default __perfMeasure('+m[1]+','+json.dumps(name)+');',content)
        if name=='preparation' and 'const getLeagueRotationOvrPercentileMaps = async' in content:
            content=content.replace('const getLeagueRotationOvrPercentileMaps = async','const getLeagueRotationOvrPercentileMapsRaw = async')
            content=content.replace('const loadTeams = async','const getLeagueRotationOvrPercentileMaps = __perfMeasure(getLeagueRotationOvrPercentileMapsRaw,"rotation.quantilesAndRead");\nconst loadTeams = async')
        if name=='writePlayerStats' and 'const doInjury = async' in content:
            content=content.replace('const doInjury = async','const doInjuryRaw = async')
            content=content.replace('const writePlayerStats = async','const doInjury = __perfMeasure(doInjuryRaw,"injuries");\nconst writePlayerStats = async')
        target.write_text(content)
    target=root/'src/worker/core/game/play.ts'
    backup=target.with_suffix('.perf-original')
    if not backup.exists(): backup.write_text(target.read_text())
    content=backup.read_text()
    if 'export const processDayOver = async' in content:
        content='import { measure as __perfMeasure } from "../../../test/perfMeasure.ts";\n'+content
        content=content.replace('export const processDayOver = async','const processDayOverRaw = async')
        content=content.replace('export const processDaysOffBeforeGame = async','export const processDayOver = __perfMeasure(processDayOverRaw,"dailySettlement");\nexport const processDaysOffBeforeGame = async')
        target.write_text(content)
    source=source.replace(' wrap(load,"default","preparation"); wrap(wp,"default","writePlayerStats"); wrap(wt,"default","writeTeamStats"); wrap(wg,"default","writeGameStats");','')
    source=source.replace(' wrap(adv, "default" in adv ? "default" : "advStats", "advStats");','')
    # Extra full-boundary measurements are opt-in and outside worker timing.
    if '--ui' in sys.argv:
        (root/'src/test/perfUI.ts').write_text((Path(__file__).parent/'ui.template.txt').read_text())
        source='import { measureUI } from "./perfUI.ts";\n'+source
        target=root/'src/worker/util/toUI.ts'
        backup=target.with_suffix('.perf-original')
        if not backup.exists(): backup.write_text(target.read_text())
        content=backup.read_text().replace('return Promise.resolve();','(globalThis as any).__bbgmPerfUICalls?.push([name, structuredClone(args)]);\n\t\treturn Promise.resolve();')
        target.write_text(content)
        source=source.replace('timings={}; active=true;', '(globalThis as any).__bbgmPerfUICalls=[]; timings={}; active=true;')
        source=source.replace('samples.push(sample);','(sample as any).ui=await measureUI((globalThis as any).__bbgmPerfUICalls); samples.push(sample);')
    # Measure time queuing IDB writes separately from waiting for durable commit.
    target=root/'src/worker/db/Cache.ts'
    backup=target.with_suffix('.perf-original')
    if not backup.exists(): backup.write_text(target.read_text())
    content=backup.read_text()
    marker='const transaction = leagueDB.transaction(stores, "readwrite");'
    if marker not in content: marker='const transaction = idb.league.transaction(stores, "readwrite");'
    content=content.replace(marker,marker+'\n const __perfEnqueueStart=performance.now();')
    content=content.replace('await transaction.done;', 'const __perfWaitStart=performance.now();\n (globalThis as any).__bbgmPerfRecord?.("IDB.enqueue",__perfWaitStart-__perfEnqueueStart);\n await transaction.done;\n (globalThis as any).__bbgmPerfRecord?.("IDB.wait",performance.now()-__perfWaitStart);',1)
    if '__perfEnqueueStart' not in content and 'tx = idb.league.transaction(stores, "readwrite");' in content:
        content=content.replace('tx = idb.league.transaction(stores, "readwrite");','tx = idb.league.transaction(stores, "readwrite");\n const __perfEnqueueStart=performance.now();')
        content=content.replace('await tx.done;','const __perfWaitStart=performance.now();\n (globalThis as any).__bbgmPerfRecord?.("IDB.enqueue",__perfWaitStart-__perfEnqueueStart);\n await tx.done;\n (globalThis as any).__bbgmPerfRecord?.("IDB.wait",performance.now()-__perfWaitStart);',1)
    if '__perfEnqueueStart' in content: target.write_text(content)
    source = source.replace(' const source = await readFile(process.env.BBGM_PERF_LEAGUE!);\n const data0 = JSON.parse(gunzipSync(source).toString());',' const data0 = await fetch("/perf-league.json").then(r=>r.json());')
    source=source.replace('  const data=structuredClone(data0);', '  const data=structuredClone(data0); if(process.env.BBGM_PERF_PHASE) data.gameAttributes.phase=Number(process.env.BBGM_PERF_PHASE);')
    source=source.replace(' const data0 = await fetch',' (globalThis as any).__bbgmPerfRecord=(name:string,ms:number)=>{if(active) record(name,ms);};\n const data0 = await fetch')
    source = source.replace('const stateHash=createHash("sha256").update(JSON.stringify(durable)).digest("hex");','const stateHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(durable))))).map(x=>x.toString(16).padStart(2,"0")).join("");')
    source = source.replace('await writeFile(process.env.BBGM_PERF_OUTPUT!,JSON.stringify({variant:process.env.BBGM_PERF_VARIANT,archiveHash:createHash("sha256").update(source).digest("hex"),samples},null,2));','await (commands as any).saveMetrics({variant:process.env.BBGM_PERF_VARIANT,archiveHash:'+json.dumps(hashlib.sha256(fixture).hexdigest())+',samples});')
    extra_imports = 'import { writeFileSync } from "node:fs";\nimport { playwright } from "@vitest/browser-playwright";\n'
    extra_define = '"process.env.BBGM_PERF_PHASE":JSON.stringify(process.env.BBGM_PERF_PHASE??""),"process.env.BBGM_PERF_VARIANT":JSON.stringify(process.env.BBGM_PERF_VARIANT),"process.env.BBGM_PERF_REPEATS":JSON.stringify(process.env.BBGM_PERF_REPEATS??"1"),'
    setup = '["src/test/setup-e2e.ts"]'
    extra_test = ',browser:{enabled:true,headless:true,provider:playwright(),instances:[{browser:"chromium"}],commands:{saveMetrics:async (_ctx,result)=>{writeFileSync(process.env.BBGM_PERF_OUTPUT,JSON.stringify(result,null,2));}}}'
else:
    (root/'perf.setup.ts').write_text('globalThis.postMessage = () => {};\nawait import("./src/test/setup.ts");\nawait import("./src/worker/index.ts");\n')
    setup = '["perf.setup.ts"]'
    extra_test = ''
(root/'src/test/playDayPerf.test.ts').write_text(source)
config = f'''{extra_imports}import {{ defineConfig }} from "vitest/config";
import {{ sportFunctions }} from {json.dumps(str(plugin))};
const sport = sportFunctions("production", "basketball");
export default defineConfig({{
 root:{json.dumps(str(root))},
 optimizeDeps:{{include:{json.dumps(["react","react-dom","react-dom/client"] + ['@bugsnag/browser', '@dnd-kit/core', '@dnd-kit/sortable', '@tanstack/react-virtual', '@uiw/color-convert', '@uiw/react-color-editable-input-rgba', '@uiw/react-color-editable-input', '@uiw/react-color-hue', '@uiw/react-color-saturation', '@uiw/react-color-swatch', '@visx/axis', '@visx/curve', '@visx/event', '@visx/group', '@visx/responsive', '@visx/scale', '@visx/shape', '@visx/text', '@visx/tooltip', 'clsx', 'confetti-js', 'd3-dsv', 'dompurify', 'facesjs/react', 'fast-deep-equal', 'framer-motion', 'match-sorter', 'nanoevents', 'react-addons-text-content', 'react-bootstrap', 'react-bootstrap/BootstrapModalManager', 'react-confirm', 'react-select', 'react/jsx-dev-runtime', 's-ago', 'use-local-storage-state', 'zustand', 'zustand/shallow', 'zustand/traditional'] if "--ui" in sys.argv else ["react","react-dom","react-dom/client"])}}},
 define:{{{extra_define}"process.env.NODE_ENV":JSON.stringify("test"),"process.env.SPORT":JSON.stringify("basketball"),__NODE_ENV:JSON.stringify("test"),__SPORT:JSON.stringify("basketball"),__JSON_URLS:JSON.stringify({{names:"/gen/names.json",namesFemale:"/gen/names-female.json",realPlayerData:"/gen/real-player-data.json",realPlayerStats:"/gen/real-player-stats.json"}})}},
 plugins:[{{name:"perf-sport",enforce:"pre",async transform(code,id){{const file=id.split("?")[0];if(!/\\.tsx?$/.test(file)||(!code.includes("bySport")&&!code.includes("isSport"))) return; return sport.transform.handler.call(this,code,id,{{moduleType:file.endsWith(".tsx")?"tsx":"ts"}});}}}}],
 test:{{include:["src/test/playDayPerf.test.ts"],setupFiles:{setup},maxWorkers:1,fileParallelism:false{extra_test}}}
}});
'''
(root/'perf.config.ts').write_text(config)
print(root/'perf.config.ts')
