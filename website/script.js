
const form = document.getElementById("refundForm");
const message = document.getElementById("message");
const submitButton = document.getElementById("submitRefund");

const WEBHOOK_URL = "http://localhost:5678/webhook/refund-request";

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const refundRequest = {
        customer_name: document.getElementById("customerName").value.trim(),
        customer_email: document.getElementById("customerEmail").value.trim(),
        order_id: document.getElementById("orderId").value.trim(),
        refund_amount: Number(document.getElementById("refundAmount").value),
        purchase_date: document.getElementById("purchaseDate").value,
        refund_reason: document.getElementById("refundReason").value.trim()
    };

    if (refundRequest.refund_amount <= 0) {
        message.className = "error";
        message.textContent = "Please enter a valid refund amount.";
        return;
    }

    if (new Date(refundRequest.purchase_date) > new Date()) {
        message.className = "error";
        message.textContent = "Purchase date cannot be in the future.";
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    message.className = "";
    message.textContent = "";

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(refundRequest)
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || "Request failed.");
        }

        message.className = "success";
        message.textContent = result.message;

        form.reset();

    } catch (error) {
        console.error("Refund submission error:", error);

        message.className = "error";
        message.textContent = "Unable to submit refund request. Please try again.";
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Refund Request";
    }
});
