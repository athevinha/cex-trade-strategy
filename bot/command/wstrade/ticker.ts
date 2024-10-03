import dotenv from "dotenv";
import { Context, NarrowedContext } from "telegraf";
import { Message, Update } from "telegraf/typings/core/types/typegram";
import { getAccountPendingAlgoOrders } from "../../helper/okx.account";
import { wsTicks } from "../../helper/okx.socket";
import {
  CampaignConfig,
  CandleWithATR,
  ICandles,
  ImgnMode,
  IPositionOpen,
  IPosSide,
  IWsTickerReponse,
} from "../../type";
import { axiosErrorDecode, decodeSymbol, decodeTimestamp, okxReponseDecode, zerofy } from "../../utils";
import WebSocket from "ws";
import { calculateATR } from "../../signals/atr";
import { openTrailingStopOrder } from "../../helper/okx.trade.algo";
import {USDT} from "../../utils/config";
dotenv.config();
let a = 0;
const _fowardTickerATRWithWs = async ({
  ctx,
  config,
  id,
  tick,
  unFillTrailingLossPosition,
  campaigns,
  tradeAbleCrypto,
  tradeAbleCryptoATRs,
  tradeAbleCryptoCandles,
  trablePositions,
  alreadyOpenTrailingPositions,
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
  unFillTrailingLossPosition: IPositionOpen[];
  id: string;
  tick: IWsTickerReponse;
  campaigns: Map<string, CampaignConfig>;
  config: CampaignConfig;
  tradeAbleCrypto: string[];
  tradeAbleCryptoCandles: { [instId: string]: ICandles };
  tradeAbleCryptoATRs: { [instId: string]: CandleWithATR[] };
  trablePositions: { [instId: string]: IPositionOpen | undefined };
  alreadyOpenTrailingPositions: { [instId: string]: boolean };
}) => {
  try {
    if (Object.keys(trablePositions).includes(tick.data[0].instId)) {
      const { markPx, instId } = tick.data[0];
      const markPrice = Number(markPx);
      const candles = tradeAbleCryptoCandles[instId];
      const multiple = config.variance
        ? Number(
            config.variance === "auto"
              ? [1, "auto"]
              : config.variance.split(",")[0]
          )
        : 0.05;
      if (!candles) return;
      const pos = trablePositions[instId] as IPositionOpen;
      // console.log(tradeAbleCryptoCandles[tickData.instId].slice(-1)[0].c, tickData.markPx)
      if (markPrice < candles[candles.length - 1].l)
        candles[candles.length - 1].l = markPrice;
      if (markPrice > candles[candles.length - 1].h)
        candles[candles.length - 1].h = markPrice;
      candles[candles.length - 1].c = markPrice;
      const currentAtr = calculateATR(candles, 14).slice(-1)[0];
      if (
        markPrice >
        Number(trablePositions[instId]?.avgPx) + currentAtr?.atr * multiple
      ) {
        const callbackRatio =
          currentAtr.fluctuationsPercent * multiple * 100 <= 0.1
            ? 0.001
            : currentAtr.fluctuationsPercent * multiple;

        if (!alreadyOpenTrailingPositions[instId]) {
          alreadyOpenTrailingPositions[instId] = true;
          const param = {
            instId,
            size: Number(pos.notionalUsd),
            posSide: pos.posSide as IPosSide,
            mgnMode: pos.mgnMode as ImgnMode,
            callbackRatio: callbackRatio.toFixed(4),
          };
          const closeAlgoOrderRes = await openTrailingStopOrder(param);
          let notificationMessage = ''
          if(closeAlgoOrderRes.msg === '') { // success
            const algoOrders = await getAccountPendingAlgoOrders({})
            const algoOrder = algoOrders.filter(aOrder => aOrder.instId === instId)[0]
            const realActivePrice = Number(algoOrder.moveTriggerPx || algoOrder.triggerPx || algoOrder.last)
            const estActivePrice = Number(trablePositions[instId]?.avgPx) + currentAtr?.atr * multiple
            const slippage = ((realActivePrice - estActivePrice) / estActivePrice) * 100;
            
            notificationMessage += `🔔 <b>[${decodeSymbol(instId)}]</b> <code>${id}</code> trailing trigger\n`;
            notificationMessage += `• <b>Time:</b> <code>${decodeTimestamp(
              Math.round(Number(algoOrder?.uTime))
            )}</code>\n`;
            notificationMessage += `• <b>Est. / Real. price:</b> <code>$${zerofy(estActivePrice)}</code> / <code>$${zerofy(realActivePrice)}</code>\n`;
            notificationMessage += `• <b>Est. / Real. variance:</b> <code>${(callbackRatio * 100).toFixed(2)}%</code> / <code>${(Number(algoOrder.callbackRatio) * 100)}%</code>\n`;
            notificationMessage += `• <b>Slippage:</b> ${slippage <= 0 ? '🟢' : '🔴'} <code>${zerofy(slippage)}%</code>\n`;
          } else {
            notificationMessage = `🔴 Auto trailing error: <code>${closeAlgoOrderRes.msg}</code>`
          }
          ctx.reply(notificationMessage, { parse_mode: "HTML" })
        }
      }
    }
  } catch (err: any) {
    await ctx.replyWithHTML(
      `[TICK] Error: <code>${axiosErrorDecode(err)}</code>`
    );
  }
};
export async function fowardTickerATRWithWs({
  ctx,
  id,
  config,
  wsPositions,
  campaigns,
  tradeAbleCrypto,
  tradeAbleCryptoCandles,
  tradeAbleCryptoATRs,
  trablePositions,
  alreadyOpenTrailingPositions,
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
  id: string;
  config: CampaignConfig;
  wsPositions: IPositionOpen[];
  campaigns: Map<string, CampaignConfig>;
  tradeAbleCrypto: string[];
  tradeAbleCryptoCandles: { [instId: string]: ICandles };
  tradeAbleCryptoATRs: { [instId: string]: CandleWithATR[] };
  trablePositions: { [instId: string]: IPositionOpen | undefined };
  alreadyOpenTrailingPositions: { [instId: string]: boolean };
}) {
  if (campaigns.get(id)?.WSTicker?.readyState === WebSocket.OPEN) return;
  if (
    !campaigns.has(id) ||
    campaigns.get(id)?.WSTrailing?.readyState === WebSocket.CLOSED ||
    campaigns.get(id)?.WS?.readyState === WebSocket.CLOSED
  ) {
    campaigns.get(id)?.WSTicker?.close();
    return;
  }

  // const unFillTrailingLossInstId = wsPositions.map(p => p.instId)
  console.log(
    "Start Ticker Socket...",
    wsPositions.map((p) => p.instId)
  );
  const WSTicker = wsTicks({
    subscribeMessage: {
      op: "subscribe",
      args: tradeAbleCrypto.map((instId) => ({
        channel: "mark-price",
        instId,
      })),
    },
    subcribedCallBack(param) {
      console.log(param);
    },
    messageCallBack(tick) {
      _fowardTickerATRWithWs({
        config,
        ctx,
        tick,
        tradeAbleCryptoCandles,
        tradeAbleCrypto,
        tradeAbleCryptoATRs,
        unFillTrailingLossPosition: wsPositions,
        id,
        campaigns,
        trablePositions,
        alreadyOpenTrailingPositions,
      });
    },
    errorCallBack(e) {
      console.log(e);
    },
    closeCallBack(code, reason) {
      console.error("[TICK] WS closed with code: ", code);
      if (code === 1005) {
        ctx.replyWithHTML(`🔗 [TICK] WebSocket connection terminated for <b><code>${id}</code>.</b>`);
        campaigns.delete(id);
      } else {
        fowardTickerATRWithWs({
          ctx,
          id,
          config,
          tradeAbleCrypto,
          tradeAbleCryptoCandles,
          tradeAbleCryptoATRs,
          wsPositions,
          campaigns,
          trablePositions,
          alreadyOpenTrailingPositions,
        });
        ctx.replyWithHTML(
          `⛓️ [TICK] [${code}] Trailing socket disconnected for <b><code>${id}</code>.</b> Reconnected`
        );
      }
    },
  });

  campaigns.set(id, { ...(campaigns.get(id) || config), WSTicker });
}
