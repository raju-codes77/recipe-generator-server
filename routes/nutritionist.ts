import { Request, Response } from "express";
import { supabase } from "../src/lib/supabase";

// আগের সব নিউট্রিশনিস্ট পাওয়ার ফাংশন
export const getNutritionist = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from("nutritionist")
      .select("*");

    if (error) {
      console.error("SUPABASE ERROR:", error);
      throw error;
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("NUTRITIONIST API ERROR:", error);

    res.status(500).json({
      success: false,
      message: error?.message || "Internal Server Error",
    });
  }
};

// নতুন যোগ করা হলো: আইডি দিয়ে একটি নির্দিষ্ট ডক্টরের ডাটা পাওয়ার জন্য
export const getNutritionistById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    
    // এই কনসোল লগটা দিয়ে দেখ টার্মিনালে আসল কি আইডি আসছে
    console.log("Backend received ID from frontend:", JSON.stringify(id));

    const { data, error } = await supabase
      .from("nutritionist")
      .select("*")
      .eq("id", id.trim()) // .trim() দিয়ে অতিরিক্ত স্পেস কেটে দেওয়া ভালো
      .single(); 

    if (error) {
      console.error("SUPABASE ERROR:", error);
      res.status(404).json({
        success: false,
        message: "Nutritionist not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("NUTRITIONIST BY ID API ERROR:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Internal Server Error",
    });
  }
};