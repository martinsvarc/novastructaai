import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const areaCode = searchParams.get("areaCode");
    const limit = searchParams.get("limit") || "5";

    if (!areaCode) {
      return NextResponse.json({ error: "areaCode is required" }, { status: 400 });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "TELNYX_API_KEY not configured" }, { status: 500 });
    }

    const params = new URLSearchParams({
      "filter[country_code]": "US",
      "filter[national_destination_code]": areaCode,
      "filter[phone_number_type]": "local",
      "filter[limit]": limit,
    });

    const response = await fetch(
      `https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("Telnyx search error:", response.status, await response.text());
      return NextResponse.json([]);
    }

    const data = await response.json();
    const numbers = (data.data || []).map((n: Record<string, unknown>) => {
      const costInfo = n.cost_information as Record<string, unknown> | undefined;
      const rawCost = String(costInfo?.monthly_cost || "1.00");
      const formattedCost = "$" + parseFloat(rawCost).toFixed(2);
      return {
        phone_number: n.phone_number as string,
        monthly_cost: formattedCost,
      };
    });

    return NextResponse.json(numbers);
  } catch (error) {
    console.error("Telnyx number search error:", error);
    return NextResponse.json([]);
  }
}
