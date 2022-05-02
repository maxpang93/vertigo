frappe.listview_settings['Asset Journal'] = {
	add_fields: ["transaction_type","status"],
	filters: [["transaction_type","=","Issue"]],
	/*
	get_indicator: function(doc) { // not working
		//console.log('doc.transaction_type=="Issue"', doc.transaction_type=="Issue")
		//console.log('doc.transaction_type=="Return"', doc.transaction_type=="Return")
		const color = {
			"Issue": "green",
			"Return": "orange"
		}
		return [__(doc.transaction_type), color[doc.transaction_type],'transaction_type,=,'+doc.transaction_type]
		
		if(doc.transaction_type=="Issue") {
			return [__("Issue"), "red"];
		} else if(doc.transaction_type=="Return") {
			return [__("Return"), "yellow"];
		} 
	}
	*/
};
