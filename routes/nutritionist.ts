import { Request, Response } from "express";
import { supabase } from "../src/lib/supabase.js";

// সব নিউট্রিশনিস্ট পাওয়ার ফাংশন
export const getNutritionist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase.from("nutritionist").select("*");
    if (error) throw error;
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("NUTRITIONIST API ERROR:", error);
    res.status(500).json({ success: false, message: error?.message || "Internal Server Error" });
  }
};

// আইডি দিয়ে নির্দিষ্ট ডক্টরের ডাটা পাওয়ার ফাংশন
export const getNutritionistById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("nutritionist")
      .select("*")
      .eq("id", id.trim())
      .single();

    if (error) {
      res.status(404).json({ success: false, message: "Nutritionist not found" });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("NUTRITIONIST BY ID API ERROR:", error);
    res.status(500).json({ success: false, message: error?.message || "Internal Server Error" });
  }
};

// অ্যাপয়েন্টমেন্ট বুকিং করার ফাংশন (সঠিক 'NutritionistApplication' টেবিল সহ)
export const createAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nutritionistId, patientName, email, phone, appointmentDate, slotTime } = req.body;

    if (!nutritionistId || !patientName || !email || !phone || !appointmentDate || !slotTime) {
      res.status(400).json({ success: false, message: "All fields are required." });
      return;
    }

    const { data, error } = await supabase
      .from("NutritionistApplication")
      .insert([
        {
          userId: nutritionistId,
          name: patientName,
          email,
          phone,
          appointment_date: appointmentDate,
          slot_time: slotTime,
        },
      ])
      .select();

    if (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }

    res.status(201).json({ success: true, message: "Appointment booked successfully!", data });
  } catch (error: any) {
    console.error("CREATE APPOINTMENT API ERROR:", error);
    res.status(500).json({ success: false, message: error?.message || "Internal Server Error" });
  }
};