import dotenv from "dotenv";
import {Context,NarrowedContext,Telegraf} from "telegraf";
import {Message,Update} from "telegraf/typings/core/types/typegram";
import {getSymbolCandles} from "../helper/okx.candles";
import {closeFuturePosition,openFuturePosition} from "../helper/okx.trade";
import {
  findEMACrossovers
} from "../signals/ema-cross";
import {ICandles,CampaignConfig,IPosSide, IWsCandlesReponse} from "../type";
import {
  axiosErrorDecode,
  decodeSymbol,
  decodeTimestamp,
  decodeTimestampAgo,
  estimatePnl,
  getTradeAbleCrypto,
  zerofy,
} from "../utils";
import {
  parseConfigInterval,
  USDT,
  WHITE_LIST_TOKENS_TRADE,
} from "../utils/config";
import {formatReportInterval} from "../utils/message";
import {calculateATR} from "../signals/atr";
import {wsCandles} from "../helper/okx.socket";
dotenv.config();
/**
 * Executes trading logic for the given interval configuration.
 *
 * @param {Object} ctx - The context from the Telegram bot, used to send messages to the user.
 * @param {CampaignConfig} config - Configuration object for the trading interval, including:
 *    - bar: Time period for each candle (e.g., 1m, 5m, 15m).
 *    - mgnMode: Margin mode, either "isolated" or "cross".
 *    - leve: Leverage used for trading.
 *    - sz: Position size for trades.
 *    - slopeThresholdUp: Maximum allowed slope for opening a position.
 *    - slopeThresholdUnder: Minimum allowed slope for opening a position.
 * @param {string[]} tradeAbleCrypto - List of cryptocurrencies that are available for trading.
 * @param {Object} lastestCandles - A record of the latest confirmed candles for each symbol.
 *    Format: { [key: string]: ICandles[] } where `key` is the symbol (e.g., BTC-USDT) and `ICandles[]` represents the candles data.
 * @param {Object} lastestSignalTs - A record of the last confirmed signal bot make tx timestamps for each symbol.
 *    Format: { [instId: string]: number } where `instId` is the symbol and `number` is the timestamp of the last executed signal.
 * @param {string} [campaignId] - Optional ID of the trading interval for logging and tracking purposes.
 *
 * @returns {Promise<void>} - Sends trade signals via the Telegram bot if an EMA crossover occurs, and opens or closes positions based on the type of crossover (bullish or bearish).
 * Handles both opening and closing positions based on EMA crossovers and applies slope filtering if configured.
 * Sends notifications of trade actions to the user via the Telegram bot context.
 *
 * @throws {Error} - If any error occurs during the trading logic execution, it is logged, and an error message is sent to the user via the Telegram bot.
 */
export const fowardTrading = async ({
  ctx,
  config,
  tradeAbleCrypto,
  lastestSignalTs,
  wsCandles,
  campaignId,
}: {
  ctx: NarrowedContext<
    Context<Update>,
    {
      message:
        | (Update.New & Update.NonChannel & Message.AnimationMessage)
        | (Update.New & Update.NonChannel & Message.TextMessage);
      update_id: number;
    }
  >;
  wsCandles: IWsCandlesReponse,
  config: CampaignConfig;
  tradeAbleCrypto: string[];
  lastestSignalTs: { [instId: string]: number }; // Lastest EmaCross bot make Tx
  campaignId?: string;
}) => {
  const { bar, mgnMode, leve, sz, slopeThresholdUp, slopeThresholdUnder} =
    config;
  let variance = config.variance
  try {
    const wsCandle = wsCandles?.data?.[0]
    if (wsCandle.confirm !== '1') return;
    await Promise.all(
        tradeAbleCrypto.map(async (SYMBOL) => {
          const candles = (await getSymbolCandles({
            instID: `${SYMBOL}`,
            before: 0,
            bar,
            limit: 300,
          })).filter(can => can.ts <= Number(wsCandle.ts));
          const emaCross = findEMACrossovers(candles, 9, 21);
          const lastestCross = emaCross[emaCross.length - 1]

          if(lastestCross.ts === Number(wsCandle.ts)) {
            console.log(SYMBOL,'cross')
            lastestSignalTs[SYMBOL] = lastestCross.ts;
            const isTrailingLossMode = variance === 'auto' || variance !== undefined
            const closePositionParams = {
              instId: SYMBOL,
              mgnMode,
              posSide:
                lastestCross.type === "bullish" ? "short" : ("long" as IPosSide),
              isCloseAlgoOrders: isTrailingLossMode ? true : false
            };
            const { closeAlgoOrderRes, closePositionRes } = await closeFuturePosition(
              closePositionParams
            );
            let openPositionMsg = "", openAlgoOrderResMsg = "";
            if(variance === 'auto'){
              const atrs = calculateATR(candles, 14)
              variance = atrs[atrs.length - 1]?.fluctuationsPercent.toFixed(4)
              if (Number(variance) < 0.001) variance = '0.001' 
              else if (Number(variance) > 1) variance = '1' 
            }
            const openPositionParams = {
              instId: SYMBOL,
              leverage: leve,
              mgnMode,
              posSide:
                lastestCross.type === "bullish" ? "long" : ("short" as IPosSide),
              size: sz,
              callbackRatio: variance
            };
            if (
              (!slopeThresholdUnder ||
                lastestCross.slopeThreshold <= slopeThresholdUnder) &&
              (!slopeThresholdUp ||
                lastestCross.slopeThreshold >= slopeThresholdUp)
            ) {
              const {openAlgoOrderRes, openPositionRes} = await openFuturePosition(openPositionParams);
              openPositionMsg = openPositionRes.msg;
              openAlgoOrderResMsg = openAlgoOrderRes.msg
            } else {
              openPositionMsg = "Slope out of range";
            }
            let estimateMoveTrigglePrice = 0
            if(openPositionParams?.posSide === 'long' && variance) estimateMoveTrigglePrice = lastestCross.c - lastestCross.c * Number(variance) 
            else if (openPositionParams?.posSide === 'short' && variance) estimateMoveTrigglePrice = lastestCross.c + lastestCross.c * Number(variance) 
            
            const {
              estPnlStopLoss,
              estPnlStopLossPercent,
              estPnlStopLossIcon,
            } = estimatePnl({
              posSide: openPositionParams.posSide as IPosSide,
              sz,
              e: lastestCross.c,
              c: estimateMoveTrigglePrice,
            });

            let notificationMessage = "";
            notificationMessage += `🔔 <b>[${decodeSymbol(
              SYMBOL
            )}]</b> | <code>${campaignId}</code> crossover Alert \n`;
            notificationMessage += `${
              lastestCross.type === "bullish" ? "📈" : "📉"
            } <b>Type:</b> <code>${
              lastestCross.type === "bullish" ? "Bullish" : "Bearish"
            }</code>\n`;
            notificationMessage += `💰 <b>Price:</b> <code>${
              zerofy(lastestCross.c) + USDT
            }</code>\n`;
            notificationMessage += `⏰ <b>Time:</b> <code>${decodeTimestamp(
              Math.round(lastestCross.ts)
            )}</code>\n`;
            notificationMessage += `⛓️ <b>Slope:</b> <code>${zerofy(
              lastestCross.slopeThreshold
            )}</code>\n`;
            notificationMessage += `📊 <b>Short | Long EMA:</b> <code>${zerofy(
              lastestCross.shortEMA
            )}</code> | <code>${zerofy(lastestCross.longEMA)}</code>\n`;
            if (openPositionMsg === "") {
              notificationMessage += `🩸 <b>Sz | Leve:</b> <code>${zerofy(
                openPositionParams.size
              )}${USDT}</code> | <code>${
                openPositionParams.leverage
              }x</code>\n`;
              if(isTrailingLossMode) notificationMessage+= `🚨 <b>Trailing Loss:</b> <code>${zerofy(estPnlStopLoss)}${USDT}</code> (<code>${zerofy(estPnlStopLossPercent * 100)}</code>%)\n`
            }
            notificationMessage += `<code>------------ORDERS-------------</code>\n`;
         
            notificationMessage += `<code>${
              openPositionMsg === ""
                ? `🟢 O: ${openPositionParams.posSide.toUpperCase()} ${decodeSymbol(
                    openPositionParams.instId
                  )}`
                : "🔴 O: " + openPositionMsg
            }</code>\n`;
            notificationMessage += `<code>${
              closePositionRes.msg === ""
                ? `🟢 C: ${closePositionParams.posSide.toUpperCase()} ${decodeSymbol(
                    closePositionParams.instId
                  )}`
                : "🔴 C: " + closePositionRes.msg
            }</code>\n`;

            if(isTrailingLossMode) {
              notificationMessage += `<code>------------ALGO---------------</code>\n`;
              notificationMessage += `<code>${
                openAlgoOrderResMsg === ""
                  ? `🟢 O: Trailing ${decodeSymbol(
                      openPositionParams.instId
                    )}`
                  : "🔴 O: " + openAlgoOrderResMsg
              }</code>\n`;
              notificationMessage += `<code>${
                closeAlgoOrderRes.msg === ""
                  ? `🟢 C: Cancel trailing ${decodeSymbol(
                      closePositionParams.instId
                    )}`
                  : "🔴 C: " + closeAlgoOrderRes.msg
              }</code>\n`;
            }
            await ctx.reply(notificationMessage, { parse_mode: "HTML" });
          }
        })
    );
  } catch (err: any) {
    await ctx.replyWithHTML(`Error: <code>${axiosErrorDecode(err)}</code>`);
  }
};

export const botAutoTrading = ({
  bot,
  intervals,
}: {
  bot: Telegraf;
  intervals: Map<string, CampaignConfig>;
}) => {
  let lastestSignalTs: { [instId: string]: number } = {};
  bot.command("start", async (ctx) => {
    const [id, ...configStrings] = ctx.message.text.split(" ").slice(1);
    const config = parseConfigInterval(configStrings.join(" "));

    if (intervals.has(id)) {
      ctx.replyWithHTML(
        `🚫 Trading interval with ID <code>${id}</code> is already active.`
      );
      return;
    }

    let tradeAbleCrypto = await getTradeAbleCrypto(config.tokenTradingMode);
    await ctx.reply(
      `Interval ${config.bar} | trade with ${tradeAbleCrypto.length} Ccy.`
    );
    if (tradeAbleCrypto.length === 0) {
      ctx.replyWithHTML("🛑 No currency to trade.");
      return;
    }
    const WS = wsCandles({
      subscribeMessage: {
        op: "subscribe",
        args: [
          {
            channel: `mark-price-candle${config.bar}`,
            instId: "BTC-USDT-SWAP",
          },
        ],
      },
      messageCallBack(wsCandles) {
        fowardTrading({
          ctx,
          config: { ...config, WS },
          tradeAbleCrypto,
          wsCandles,
          lastestSignalTs,
          campaignId: id,
        });
      },
      closeCallBack(code, reason) {
        console.log("close:", code, reason.toString());
      },
      subcribedCallBack(param) {
        console.log("subcribed:", param);
      },
    });
  
    intervals.set(id, { ...config, tradeAbleCrypto, WS });

    const startReport = formatReportInterval(
      id,
      { ...config, WS},
      true,
      tradeAbleCrypto
    );
    ctx.replyWithHTML(startReport);
  });

  bot.command("stop", (ctx) => {
    const id = ctx.message.text.split(" ")[1];

    if (!intervals.has(id)) {
      ctx.replyWithHTML(
        `🚫 No active trading interval found with ID <code>${id}</code>.`
      );
      return;
    }

    const CampaignConfig = intervals.get(id);
    CampaignConfig?.WS.close()
    intervals.delete(id);

    ctx.replyWithHTML(`🛑 Stopped trading interval <b><code>${id}</code>.</b>`);
  });

  bot.command("tasks", (ctx) => {
    if (intervals.size === 0) {
      ctx.replyWithHTML("📭 No trading intervals are currently active.");
      return;
    }

    let report = "<b>Current Trading Intervals:</b>\n";
    intervals.forEach((CampaignConfig, id) => {
      report +=
        formatReportInterval(
          id,
          CampaignConfig,
          false,
          CampaignConfig?.tradeAbleCrypto
        ) + "\n";
    });

    ctx.replyWithHTML(report);
  });

  bot.command("stops", (ctx) => {
    intervals.forEach((CampaignConfig) => {
      CampaignConfig?.WS.close()

    });
    intervals.clear();
    ctx.replyWithHTML("🛑 All trading intervals have been stopped.");
  });
};
