import { Telegraf } from "telegraf";
import { getAccountPositionsHistory } from "../helper/okx-account";
import { decodeTimestamp, decodeTimestampAgo, formatU, generateTableReport, zerofy } from "../utils";
import {USDT} from "../utils/config";
import {writeFileSync} from "fs";

export const botReportPositionsHistory = ({ bot }: { bot: Telegraf }) => {
  bot.command("history", async (ctx) => {
    try {
      // Fetch positions history
      const positionsHistory = await getAccountPositionsHistory("SWAP");

      if (positionsHistory.length === 0) {
        await ctx.reply("No position history found.");
        return;
      }

      // Initialize counters
      let totalFee = 0;
      let totalRealizedPnl = 0;
      let totalPositions = 0;
      let totalVolume = 0;

      // Get the last 10 positions history
      const recentPositions = positionsHistory.sort((a,b) => Number(b.uTime) - Number(a.uTime));
      const showPositionHistory = 5
      // Generate report for the last 10 positions
      let positionReports = "";
      recentPositions.forEach((position, index) => {
        if(index <= showPositionHistory) {
          const realizedPnlIcon =
            parseFloat(zerofy(position.realizedPnl)) >= 0 ? "🟩" : "🟥";
            
          const tradeLink = `https://www.okx.com/trade-swap/${position.instId.toLowerCase()}`;
          let report = ``;
          report += `<b>[${position.posSide.toUpperCase()}]</b> <b><a href="${tradeLink}">${position.instId.split("-").slice(0, 2).join("/")}</a></b> | ${decodeTimestampAgo(Number(position.uTime))}\n`;
          report += `• <b>O/C Avg Px:</b> <code>${zerofy(position.openAvgPx)}${USDT}</code> | <code>${zerofy(position.closeAvgPx)}${USDT}</code>\n`;
          report += `• <b>Pnl:</b> <code>${zerofy(position.realizedPnl)}${USDT}</code> ( <code>${zerofy(position.fee)}${USDT}</code> ) • ${realizedPnlIcon}\n\n`;

          positionReports += report;
        }
        // Accumulate totals
        totalFee += parseFloat(position.fee);
        totalRealizedPnl += parseFloat(position.realizedPnl);
        totalVolume += parseFloat(position.openMaxPos);
        totalPositions++;
      });

      // Generate the summary report
      let summaryReport =``;
      summaryReport += `<b>Total Positions:</b> <code>${totalPositions}</code>\n`;
      summaryReport += `<b>Total Volume:</b> <code>${zerofy(
        totalVolume
      )}</code>\n`;
      summaryReport += `<b>Total Fee:</b> <code>${zerofy(totalFee)}${USDT}</code>\n`
      summaryReport += `<b>Total Realized PnL:</b> <code>${zerofy(
        totalRealizedPnl
      )}${USDT}</code> • ${totalRealizedPnl >= 0 ? "🟩" : "🟥"}\n`;
      summaryReport += `<code>-------------------------------</code>\n`;

      // Send the summary and the detailed reports
      await ctx.reply(summaryReport + positionReports, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });


      // Aggregate positions by symbol and calculate total realized PNL
      const symbolPnLMap: Record<string, number> = {};

      positionsHistory.forEach((position) => {
        const symbol = position.instId.split("-").slice(0, 2).join("/");
        const pnl = parseFloat(zerofy(position.realizedPnl));
        if (!symbolPnLMap[symbol]) {
          symbolPnLMap[symbol] = 0;
        }
        symbolPnLMap[symbol] += pnl;
      });
      // ========================================

      const fullReportPath = "report/full_position_report.txt";
           const tableData = Object.entries(symbolPnLMap).map(([symbol, pnl]) => ({
        Symbol: symbol,
        "Realized PnL": `${zerofy(pnl)} USD`,
        Icon: pnl >= 0 ? "Profit" : "Loss",
        PnLValue: pnl,  // Adding numeric value for sorting
      }));

      // Sort the tableData by PnLValue
      const sortedTableData = tableData.sort((a, b) => b.PnLValue - a.PnLValue);

      const tableHeaders = ["Symbol", "Realized PnL", "Icon"];
      const fullReport = generateTableReport(sortedTableData, tableHeaders);
      await writeFileSync(fullReportPath, fullReport);
      await ctx.replyWithDocument({
        source: fullReportPath,
        filename: "report/full_position_report.txt",
      });
    } catch (err: any) {
      console.error("Error fetching position history: ", err.message || err);
      await ctx.reply("Error fetching position history.");
    }
  });
};
