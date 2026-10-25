import type { ToolFactory } from '../console';
import { acousticTool } from './acoustic';
import { dossierTool } from './dossier';
import { faceTool } from './face';
import { forecastTool } from './forecast';
import { locationTool } from './location';
import { platesTool } from './plates';
import { socialTool } from './social';
import { stingrayTool } from './stingray';

/** In rail order. */
export const TOOLS: ToolFactory[] = [platesTool, locationTool, stingrayTool, faceTool, acousticTool, socialTool, forecastTool, dossierTool];
