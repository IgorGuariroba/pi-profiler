import { test } from "node:test";
import assert from "node:assert/strict";
import { toolOpen, toolClose, contextOpen, contextClose } from "../src/spans.ts";
import { projectTimeline } from "../src/timeline.ts";
const call=(id,name,args,ts,extra={})=>[toolOpen({toolCallId:id,toolName:name,args,ts}),toolClose({toolCallId:id,toolName:name,bytesOut:1,isError:false,ts:ts+10,...extra})];

test("agrega arquivos por path",()=>{const t=projectTimeline([...call("1","read",{path:"/a"},1),...call("2","edit",{path:"/a"},20)]);assert.deepEqual(t.files[0],{path:"/a",reads:1,writes:0,edits:1,calls:2,wastedReads:0});});
test("agrega comandos com exitCode, duração e truncagem",()=>{const t=projectTimeline([...call("1","bash",{command:"npm test"},1,{exitCode:1,outputTruncated:true})]);assert.equal(t.commands[0].exitCodes["1"],1);assert.equal(t.commands[0].avgDurationMs,10);assert.equal(t.commands[0].outputTruncated,1);});
test("releitura sem write gera alerta",()=>{const t=projectTimeline([...call("1","read",{path:"/a"},1),...call("2","read",{path:"/a"},20)]);assert.equal(t.tools[1].wastedRead,true);assert.equal(t.files[0].wastedReads,1);});
test("releitura após edit não alerta",()=>{const t=projectTimeline([...call("1","read",{path:"/a"},1),...call("e","edit",{path:"/a"},10),...call("2","read",{path:"/a"},20)]);assert.equal(t.tools[2].wastedRead,undefined);});
test("releitura após compaction não alerta",()=>{const c={seq:1,turnIndex:0,tokens:100,contextWindow:1000,ts:15,compaction:{tokensBefore:900,summary:"s",firstKeptEntryId:"x"}};const t=projectTimeline([...call("1","read",{path:"/a"},1),contextOpen(c),contextClose(c),...call("2","read",{path:"/a"},20)]);assert.equal(t.tools[1].wastedRead,undefined);});
