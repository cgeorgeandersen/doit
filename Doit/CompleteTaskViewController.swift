//
//  CompleteTaskViewController.swift
//  Doit
//
//  Created by Kaitlyn  Caracciolo on 2/18/19.
//  Copyright © 2019 George Andersen. All rights reserved.
//

import UIKit

class CompleteTaskViewController: UIViewController {
    
    @IBOutlet weak var taskLabel: UILabel!
    var task = Task()
    var previousVC = TasksViewController()
    
    override func viewDidLoad() {
        super.viewDidLoad()
       
        if task.important {
           taskLabel.text = "❗️\(task.name)"
        } else {
           taskLabel.text = task.name
        }
        
        // Do any additional setup after loading the view.
    }
    
    @IBAction func completeTapped(_ sender: Any) {
        previousVC.tasks.remove(at: previousVC.selectedIndex)
        previousVC.tableview.reloadData()
        navigationController!.popViewController(animated: true)
    }
    
    

}
