import dotenv from "dotenv";
import {Telegraf} from "telegraf";
import {botLoginCommand} from "./command/auth";
import {botCatchError} from "./command/catch";
import {botReportPositionsHistory} from "./command/history";
import {botReportPositions} from "./command/positions";
import {botReportSymbolReport} from "./command/symbols-report";
import {botAutoTrading} from "./command/trade";
import {IPosSide} from "./type";
import {decodeSymbol} from "./utils";
dotenv.config();

export async function bot(apiKey?: string) {
  if (apiKey) {
    const bot = new Telegraf(apiKey);
    const validUsername = "vicdvc";
    let authenticated = false;
    
    botLoginCommand({bot, authenticated, validUsername})
    botCatchError({bot})
    botReportPositions({bot})
    botReportPositionsHistory({bot})
    botReportSymbolReport({bot})
    botAutoTrading({bot})

    bot.launch();
    
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }
}

export const decodeClOrdId = ({intervalId, instId, posSide, leverage, size}: {intervalId: string, instId: string, posSide: IPosSide, leverage: number, size: number}) => {
  return `${intervalId}o${size}o${leverage}o${decodeSymbol(instId)}o${posSide}`.replaceAll('-','o').replaceAll('_','o').replaceAll('/','o').slice(0,32).toLowerCase()
}