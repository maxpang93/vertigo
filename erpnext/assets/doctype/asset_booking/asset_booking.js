// Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('Asset Booking', {
	refresh: async function (frm) {
		console.log("refresh")
		var me = frm;
		var doc = frm.doc;
		
		if (doc.docstatus == 0 && !frm.is_new()) {
			frm.add_custom_button(__("Check Asset Availability"), () => {
				me.call({
					doc: me.doc,
					method: "update_booking_items_conflict",
				});
			})
		}

		if (frm.is_new()){
			//console.log("is new!!")
			const __get_no_copy_fields = (child_table_name) => {
				let docfields= frm.fields_dict[child_table_name].grid.docfields;
				let no_copy_fields = docfields.filter(o => { return o.no_copy }).map(o => { return o.fieldname })
				return no_copy_fields
			}
			const no_copy_fields = __get_no_copy_fields("booking_items")
			//console.log("no_copy_fields =>",no_copy_fields)

			for (let item of doc.booking_items){
				for (let field of no_copy_fields) {
					if (item[field]) {
						frappe.model.set_value("Asset Booking Items", item.name, field, null)
					}
				}
			}
			
		}
		/*
		frm.add_custom_button(__("test"), () => {
			let docfields= frm.fields_dict.booking_items.grid.docfields;
			console.log(docfields)
			//to_log = frm.get_docfield("booking_items")
			let to_log;
			let no_copy_fields = docfields.filter(o => { return o.no_copy && o.fieldtype == "Link"}).map(o => { return o.fieldname })
			console.log(no_copy_fields)
		}) 
		*/ 

		if (doc.docstatus == 1) {
			frm.add_custom_button(__("Update Items"), () => {
				frm.trigger("update_child_items")
			})

			frm.add_custom_button(__("Issue asset"), () => { 
				frm.trigger("make_asset_issue")
			}, __("Create asset transfer"), "btn-default");

			frm.add_custom_button(__("Return asset"), () => {
				frm.trigger("make_asset_return")
			}, __("Create asset transfer"), "btn-default")
		}
		frm.trigger("add_table_desc")
		///frm.trigger("make_field_readonly")
	},

	before_save: function (frm) {
		var doc = frm.doc
		if (!doc.booking_items) return
		
		//frappe.throw("test")
		frm.call("check_booking_items_conflict", {  // one remote call to update whole table 
			booking_items: doc.booking_items
		}).then(r => {
			if (r.message) {
				doc.booking_items = r.message
			}
		})
	},

	before_submit: function (frm) {
		var doc = frm.doc;
		let available = doc.booking_items.map(o => { return o.available })
		let some_unavailable = available.some(bool => { return !bool })
		if (some_unavailable) {
			frappe.throw(__("Some assets are not available for booking"))
		}
	},

	make_asset_issue: function (frm) { /// add skip_row for already issued asset
		console.log("issuing asset")
		let opts = {
			source_doctype: "Asset Booking Items",
			target: frm,
			setters: [
				{
					label: __("Asset"),
					fieldname: "asset",
					fieldtype: "Link",
					options: "Asset",
				},
				{
					label: __("Custodian"),
					fieldname: "custodian",
					fieldtype: "Link",
					options: "Employee",
				},
				{
					label: __("Required At"),
					fieldname: "required_location",
					fieldtype: "Link",
					options: "Location",
				}, 
				{
					label: __("Asset Issue Journal"),
					fieldname: "asset_issue",
					fieldtype: "Link",
					options: "Asset Journal",
					hidden: 1,
				}
			], 
			get_query_filters: {
				parent: frm.doc.name
			}
		}

		var d = new frappe.ui.form.SelectChildrenDialog({
			//me: this, //$%* to close dialog, but not working
			doctype: opts.source_doctype,
			target: opts.target,
			date_field: "from_date",
			setters: opts.setters,
			resize: true,

			get_query: opts.get_query_filters ? function() {
				return {
					filters: opts.get_query_filters
				}
			} : () => { console.log("no query filters") },

			skip_row: function(row) { //skip displaying row if true
				if (row.asset_issue) return true;
				
			},

			post_selection_action_label: "Issue Asset",
			post_selection_action: function (selections) {
				if (selections.length === 0 ) {
					frappe.throw(__("No items are selected"))
				}
				frappe.call({
					method: "erpnext.assets.doctype.asset_journal.asset_journal.make_asset_issue",
					freeze: true,
					freeze_message: __("Creating Asset Issue ..."),
					args: {
						"asset_booking": frm.doc.name,
						"selected_items": selections,
					},
					callback: function (r) {
						if (r) {
							console.log(r) // r = { message: "AST-BK-2022-00056" }  *remember to "submit" doc
							// =>  please redirect to asset journal form
							// OR show popup message and user click to view form
							frappe.show_alert({
								message:__('Asset Issue {0} is created & submitted successfully',[r.message]),
								indicator:'green'
							}, 5);
						}
					} 
				})
				//me.hide(); //$%* close inside SelectChildrenDialog instead
			}
		})
	},

	make_asset_return: async function (frm) { /// add skip_row for already returned asset
		console.log("returning asset")
		let opts = {
			source_doctype: "Asset Booking Items",
			target: frm,
			setters: [
				{
					label: __("Asset"),
					fieldname: "asset",
					fieldtype: "Link",
					options: "Asset",
				},
				{
					label: __("Custodian"),
					fieldname: "custodian",
					fieldtype: "Link",
					options: "Employee",
				},
				{
					label: __("Asset Issue Journal"),
					fieldname: "asset_issue",
					fieldtype: "Link",
					options: "Asset Journal",
				},
				{
					label: __("Asset Return Journal"),
					fieldname: "asset_return",
					fieldtype: "Link",
					options: "Asset Journal",
					hidden: 1,
				}
			], 
			get_query_filters: {
				parent: frm.doc.name
			}
		}

		var d = new frappe.ui.form.SelectChildrenDialog({
			doctype: opts.source_doctype,
			target: opts.target,
			date_field: "to_date",
			setters: opts.setters,
			resize: true,

			get_query: opts.get_query_filters ? function() {
				return {
					filters: opts.get_query_filters
				}
			} : () => { console.log("no query filters") },

			skip_row: function(row) { //skip displaying row if true
				if (!row.asset_issue) return true;
				if (row.asset_issue && row.asset_return) return true;
			},

			post_selection_action_label: "Return Asset",
			post_selection_action: function (selections) {
				if (selections.length === 0 ) {
					frappe.throw(__("No items are selected"))
				}
				frappe.call({
					method: "erpnext.assets.doctype.asset_journal.asset_journal.make_asset_return",
					freeze: true,
					freeze_message: __("Creating Asset Return ..."),
					args: {
						"asset_booking": frm.doc.name,
						"selected_items": selections,
					},
					callback: function (r) {
						if (r) {
							console.log(r) // r = { message: "AST-BK-2022-00056" }  *remember to "submit" doc
							// =>  please redirect to asset journal form
							// OR show popup message and user click to view form
							frappe.show_alert({
								message:__('Asset Return {0} is created & submitted successfully',[r.message]),
								indicator:'green'
							}, 5);
						}
					} 
				})
				//me.hide(); //$%* close inside SelectChildrenDialog instead
			}
		})
	}, 

	project: function (frm) {
		var doc = frm.doc;
		if (!doc.booking_items) return;
		for (let item of doc.booking_items) {
			frappe.model.set_value("Asset Booking Items", item.name, "project", doc.project)
		}
	},

	add_table_desc: function (frm) {
		try {
			console.log(moment().format(), "=> moment.js is working");	// proof
		} catch (e) {
			console.log("moment.js is not working. Error => ", e)
		}

		var doc = frm.doc;
		if (!doc.booking_items) return;
		//if (doc.docstatus != 0) return;
		for (let item of doc.booking_items) {
			let row_html = $(`[data-name="${item.name}"]`)
			//console.log(row_html)
			if (item.asset) {
				let asset_html = $(`[data-name="${item.asset}"]`) // *frm.set_indicator_formatter changes default html elements. So instead indicator color class is forced manually

				if (item.docstatus == 0 && item.available && !item.remarks) {
					asset_html.attr("class", "indicator green")
					asset_html.attr("title", `${item.remarks || ''}`)
				}
				else if (item.docstatus == 0 && item.available && item.remarks) { // maintenance not prioritized
					asset_html.attr("class", "indicator green") // change to other colour? cyan, blue, orange, yellow, gray, light-gray, pink, purple. light-blue
					asset_html.attr("title", `${item.remarks || ''}`)
				}
				else if (item.docstatus == 0 && !item.available) {
					asset_html.attr("class", "indicator red")
					asset_html.attr("title", `${item.remarks ? item.remarks : "Unknown reason"}`) // see above *
				}
				else {
					asset_html.attr("title", `${item.remarks || ''}`) // submitted/cancelled doc shows asset_name for viewing convenience
				}
			}

			const format_AMPM = (date) => {
				return moment(date).format("YYYY-MM-DD hh:mm A")
			}

			let from_date_html = row_html.find('[data-fieldname="from_date"]');
			if (item.from_date) {
				from_date_html.attr("title", format_AMPM(item.from_date))
			} else {
				from_date_html.removeAttr("title") // ** remove title if field empty. Frappe "refresh" doesn't remove custom attributes
			}

			let to_date_html = row_html.find('[data-fieldname="to_date"]');
			if (item.to_date) {
				to_date_html.attr("title", format_AMPM(item.to_date))
			} else {
				to_date_html.removeAttr("title") // **
			}

			let custodian_html = row_html.find('[data-fieldname="custodian"]');
			if (item.custodian) {
				frappe.db.get_doc("Employee", item.custodian).then(doc => {
					custodian_html.attr("title", doc.employee_name)
				})
			} else {
				custodian_html.removeAttr("title") // **
			}
		}
	},

	make_field_readonly: function (frm) { /// not working ideally
		var doc = frm.doc;
		if (!doc.booking_items) return;
		let rows = frm.fields_dict["booking_items"].grid.grid_rows;
		for (let row of rows) {
			if (row.doc.available) {
				let field_remarks = row.docfields.filter(df=> {return df.fieldname == "remarks"})
				console.log(field_remarks)
				field_remarks[0].read_only=1
			}
		}
		frm.refresh_field("booking_items")
		
	},

	test_update_dialog_items: function(frm) { /// Test function : to delete
		let self = {}
		self.data = [];
		/*
		const get_data = () => {
			return self.data;
		}
		const set_data = (new_data) => {
			self.data = new_data;
		}
		*/
		const d = new frappe.ui.Dialog({
			title: __("Customer Details"),
			fields: [{
				fieldtype: "Table",
				fieldname: "customer_items",
				label: __("Items"),
				reqd: 1,
				//data: self.data,
				//cannot_add_rows: 1,
				data: self.data,
				/*
				get_data: () => {
					return this.data;
				},
				set_data: function(new_data) {
					this.data = new_data;
					this.fields_dict.customer_items.grid.refresh();
				}, */
				fields: [{
					fieldtype: "Link",
					fieldname: "customer",
					label: __("Customer"),
					options: "Customer",
					in_list_view: 1,
					//in_place_edit: false,
					reqd: 1,
					onchange: function (e) {
						console.log("Selected Customer: ", this.value)
						console.log(this)
						let idx = this.doc.idx
						//me.grid.grid_rows[this.doc.idx-1].refresh_field(this.df.fieldname); //expression from online, not tested
						/*
						let data = this.get_data()
						let row = data.filter(o=>{return o.idx==idx})
						console.log("changed row =>",row)
						row.count += 1;
						this.set_data(data)
						*/
					}
				},{
					fieldtype: "Int",
					fieldname: "count",
					label: __("Count"),
					in_list_view: 1,
					default: 1,
				}]
			}],
		})
		//d.fields_dict.customer_items.df.data.push({
		//	"customer":"Good Customer"
		//})
		self.data = d.fields_dict.customer_items.df.data;
		d.fields_dict.customer_items.grid.refresh();
		d.show()
	},

	update_child_items: function (frm) {
		console.log("updating child items")
		var current_form = frm;
		let me = {} // ** "this" is undefined, somehow.. replaced with dummy variable "me"
		//this.data = [] // **
		me.data = [];
		
		// fields to change (will appear in table layout) 
		const fields = [{
			fieldtype: "Link",
			label: __("Asset"),
			fieldname: "asset",
			options: "Asset",
			in_list_view: 1,
			read_only:1, // if not using this asset, user delete row
		}, {
			fieldtype: "Link",
			label: __("Custodian"),
			fieldname: "custodian",
			options: "Employee",
			in_list_view: 1,
			/*
			onchange: function(event) { //onchange() event not returning row OR row's name
				console.log("Custodian onchange()")
				//console.log("onchange changed_row",this.value) //"this" is undefined
				//console.log("onchange changed_row",me.value)
				//console.log("onchange", event.target.value) //TypeError: opts.df.fieldtype is undefined
				let data = dialog.fields_dict.trans_items.df.data;
				//console.log("onchange Custodian => new data",data); 
				//console.log("onchange Custodian => old data", me.data); //old == new
				//console.log(dialog.fields_dict)
				console.log(dialog)
			} */
		}, {
			fieldtype: "Link",
			label: __("Required At"),
			fieldname: "required_location",
			options: "Location",
			in_list_view: 1,
		}, {
			fieldtype: "Datetime",
			label: __("Required From"),
			fieldname: "from_date",
			in_list_view: 1,
		}, {
			fieldtype: "Datetime",
			label: __("Required To"),
			fieldname: "to_date",
			in_list_view: 1,
		}, {
			fieldtyoe: "Link",
			label: __("Booking Log"),
			fieldname: "asset_booking_log",
			in_list_view: 1,
			options: "Asset Booking Log",
			read_only: 1,
		}];
	
		const dialog = new frappe.ui.Dialog({
			title: __("Update Items"),
			size: "large",
			fields: [
				{
					fieldname: "trans_items",
					fieldtype: "Table",
					label: "Items",
					cannot_add_rows: true,
					in_place_edit: true,
					read_only: 1,
					//reqd: 1,
					data: me.data,
					/*
					get_data: () => {
						return this.data;
					}, */
					fields: fields
				},
			],
			primary_action: function () {
				console.log("primary action.. haha") //max
				///console.log(dialog.fields_dict.trans_items.grid.get_selected_children())
				function get_deleted() {
					let newdata = dialog.fields_dict.trans_items.df.data.map(o => { return o.name });
					let data = me.original_data;
					console.log(data,newdata)
					let deleted = [];
					for (let d of data){
						if (!newdata.includes(d.name)) deleted.push(d)
					}
					console.log("Rows deleted from dialog",deleted)
					return deleted;
				}
				
				const to_delete = get_deleted()
				let err_msg = "";
				for (let row of to_delete) {
					if (row.asset_issue_journal_log) {
						err_msg += `Row ${row.idx} (${row.asset}) already issued. Cannot be deleted\n`
					}
				}
				if (err_msg) {
					console.log(err_msg)
					dialog.hide()
					frappe.throw(__(err_msg))
				}
				console.log("if error, not suppose to print this out..")
				
				frm.call("update_booking_items", {
					asset_booking: frm.doc.name,
					children: dialog.fields_dict.trans_items.df.data,
					selected: dialog.fields_dict.trans_items.grid.get_selected_children(),
					deleted: to_delete,
				})
				///dialog.hide();
				current_form.refresh_field("booking_items") //max: not working, regardless of dialog.hide() sequence
				dialog.hide();
			},
			primary_action_label: __("Update")
		})
		dialog.$wrapper.find('.modal-content').css({
			"overflow": "auto",
			"resize": "both",
		})
		frm.doc["booking_items"].forEach(d => {
			if (d.asset_issue_journal_log && d.asset_return_journal_log) return /// issued & returned, => cannot edit anymore.. 
			dialog.fields_dict.trans_items.df.data.push({
				"name": d.name,
				"asset": d.asset,
				"custodian": d.custodian,
				"required_location": d.required_location,
				"from_date": d.from_date,
				"to_date": d.to_date,
				//"__checked": 1,
				"asset_booking_log": d.asset_booking_log,
				"asset_issue": d.asset_issue,
				"asset_issue_journal_log": d.asset_issue_journal_log,
				"asset_return": d.asset_return,
				"asset_return_journal_log": d.asset_return_journal_log,
			});
		});
		me.original_data = me.data = dialog.fields_dict.trans_items.df.data;
		//me.original_data = me.data;
		dialog.fields_dict.trans_items.grid.refresh();
		dialog.show()
	},
});

frappe.ui.form.on('Asset Booking Items', {
	asset: function (frm, cdt, cdn) {
		var doc = frm.doc;
		if (!doc.booking_items) return;
		let assets = doc.booking_items.map(o => { return o.asset })
		let item = frappe.get_doc(cdt, cdn)
		let same_items = assets.filter(a => { return a == item.asset })
		if (same_items.length > 1) {
			const editable_fields = ["asset", "current_location", "from_date", "to_date", "required_location"]
			for (let key of editable_fields) {
				frappe.model.set_value(cdt, cdn, key, null);
			}
			frappe.throw(__("Asset already in table"));
		}
	},

	from_date: function (frm, cdt, cdn) {
		let row = frappe.get_doc(cdt, cdn)
		if (row.asset && row.from_date) {
			frm.call("check_asset_availability", { // asset from_date > available_date
				asset: row.asset,
				from_date: row.from_date
			}).then(r => {
				if (r.message) {
					frappe.msgprint({
						title: __("Warning"),
						indicator: "orange",
						message: __(r.message.err_msg)
					})
					frappe.model.set_value(cdt, cdn, "from_date", null);
				}
			})
		} else {
			frappe.model.set_value(cdt, cdn, "from_date", row.from_date); // set_value for latest date, else "before_save => check_booking_items_conflict" gets old date
		}
	},

	to_date: function (frm, cdt, cdn) {
		let row = frappe.get_doc(cdt, cdn)
		if (row.to_date && row.to_date < row.from_date) {
			frappe.msgprint({
				title: __("Warning"),
				indicator: "orange",
				message: __(`Ending time must be later than <b>${row.from_date}</b>`)
			})
			frappe.model.set_value(cdt, cdn, "to_date", null);
		} else {
			frappe.model.set_value(cdt, cdn, "to_date", row.to_date); // set_value for latest date, else "before_save => check_booking_items_conflict" gets old date
		}
	},

	booking_items_add: function (frm, cdt, cdn) {
		if (frm.doc.project) {
			frappe.model.set_value(cdt, cdn, "project", frm.doc.project)
		}
		if (frm.doc.requesting_employee) {
			frappe.model.set_value(cdt, cdn, "requesting_employee", frm.doc.requesting_employee)
		}
	}
});
